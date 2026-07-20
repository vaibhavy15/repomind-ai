from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    get_subject_from_token,
    hash_password,
    verify_password,
)
from app.db.models import Event, User
from app.db.session import get_db
from app.schemas.auth import (
    ChangePasswordRequest,
    EventOut,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
    UpdateMeRequest,
    UserOut,
)
from app.services.activity_service import log_event

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    user = User(name=payload.name, email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    log_event(db, user.id, "account_created", "Created your RepoMind AI account")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user and user.hashed_password is None:
        provider = user.oauth_provider or "a connected account"
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"This account uses {provider} sign-in — use that button instead of a password.")
    # deliberately generic error — don't reveal whether the email is registered
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        user_id = get_subject_from_token(payload.refresh_token, expected_type="refresh")
    except InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateMeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.email and payload.email != current_user.email:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email is already in use")
        current_user.email = payload.email
    if payload.name:
        current_user.name = payload.name

    pref_fields = ("notify_indexing_complete", "notify_weekly_digest", "notify_product_updates", "gemini_api_key")
    updates = {f: getattr(payload, f) for f in pref_fields if getattr(payload, f) is not None}
    if updates:
        # reassign the whole dict (rather than mutate in place) so SQLAlchemy
        # reliably detects the change on a JSON column
        current_user.preferences = {**(current_user.preferences or {}), **updates}

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.hashed_password is not None:
        # existing password set — must prove you know it
        if not payload.current_password or not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    # else: OAuth-only account setting a password for the first time — no current password to check

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.delete(current_user)  # cascades to repositories, files, conversations, messages, events
    db.commit()


@router.get("/me/activity", response_model=list[EventOut])
def my_activity(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Event)
        .filter(Event.user_id == current_user.id)
        .order_by(Event.created_at.desc())
        .limit(20)
        .all()
    )


@router.get("/me/usage")
def my_usage(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.db.models import Conversation, Message, Repository

    repo_count = db.query(Repository).filter(Repository.owner_id == current_user.id).count()
    files_indexed = (
        db.query(Repository).filter(Repository.owner_id == current_user.id).with_entities(Repository.file_count).all()
    )
    questions_asked = (
        db.query(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(Repository, Conversation.repository_id == Repository.id)
        .filter(Repository.owner_id == current_user.id, Message.role == "user")
        .count()
    )
    security_scans_run = db.query(Event).filter(Event.user_id == current_user.id, Event.type == "security_scan_viewed").count()
    readmes_generated = db.query(Event).filter(Event.user_id == current_user.id, Event.type == "readme_generated").count()

    return {
        "repositories": repo_count,
        "files_indexed": sum(f[0] for f in files_indexed),
        "questions_asked": questions_asked,
        "security_scans_run": security_scans_run,
        "readmes_generated": readmes_generated,
    }


RESET_TOKEN_MINUTES = 30


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    generic_response = {"message": "If an account exists for that email, a reset link has been generated."}

    if not user or user.hashed_password is None:
        # don't reveal whether the email exists, or that it's an OAuth-only account
        return generic_response

    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": user.id, "type": "reset", "iat": now, "exp": now + timedelta(minutes=RESET_TOKEN_MINUTES)},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    reset_link = f"{settings.FRONTEND_URL}/forgot-password.html?token={token}"

    if settings.DEBUG:
        # No SMTP/email provider is wired up yet — in dev mode we hand back
        # the link directly instead of silently doing nothing. Wire a real
        # mailer here (and drop this field) before running with DEBUG=false.
        generic_response["dev_reset_link"] = reset_link
    return generic_response


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    try:
        claims = jwt.decode(payload.token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired reset link")
    if claims.get("type") != "reset":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired reset link")

    user = db.get(User, claims["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired reset link")

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
