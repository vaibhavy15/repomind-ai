from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.db.models import User
from app.db.session import get_db
from app.services import oauth_service

router = APIRouter(prefix="/auth/oauth", tags=["oauth"])


@router.get("/providers")
def list_configured_providers():
    """Lets the frontend gray out/hide provider buttons that have no
    credentials configured, instead of sending the user into a raw JSON
    error page after they click one."""
    return {name: oauth_service.is_configured(name) for name in oauth_service.PROVIDERS}


@router.get("/{provider}/login")
def oauth_login(provider: str):
    if provider not in oauth_service.PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown provider: {provider}")
    if not oauth_service.is_configured(provider):
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED,
            f"{provider.capitalize()} sign-in isn't configured on this server yet — "
            f"set {provider.upper()}_CLIENT_ID / {provider.upper()}_CLIENT_SECRET in .env. "
            f"See backend/README.md for the exact registration steps.",
        )

    state = oauth_service.create_state_token()
    url = oauth_service.build_authorize_url(provider, state)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND)


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    def to_frontend_error(message: str) -> RedirectResponse:
        url = f"{settings.FRONTEND_URL}/oauth-callback.html?{urlencode({'error': message})}"
        return RedirectResponse(url, status_code=status.HTTP_302_FOUND)

    if provider not in oauth_service.PROVIDERS:
        return to_frontend_error(f"Unknown provider: {provider}")
    if error:
        return to_frontend_error(f"{provider} denied access: {error}")
    if not code or not state or not oauth_service.verify_state_token(state):
        return to_frontend_error("Invalid or expired OAuth state — please try signing in again.")

    try:
        access_token = await oauth_service.exchange_code_for_token(provider, code)
        profile = await oauth_service.fetch_profile(provider, access_token)
    except oauth_service.OAuthError as exc:
        return to_frontend_error(str(exc))

    # match by (provider, oauth_id) first, then fall back to email so a user
    # who signed up with a password can also log in with a matching OAuth account
    user = (
        db.query(User)
        .filter(User.oauth_provider == provider, User.oauth_id == profile["oauth_id"])
        .first()
    )
    if not user:
        user = db.query(User).filter(User.email == profile["email"]).first()

    if user:
        if not user.oauth_provider:
            user.oauth_provider = provider
            user.oauth_id = profile["oauth_id"]
            db.commit()
    else:
        user = User(
            name=profile["name"],
            email=profile["email"],
            hashed_password=None,
            oauth_provider=provider,
            oauth_id=profile["oauth_id"],
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    tokens = {
        "access_token": create_access_token(user.id),
        "refresh_token": create_refresh_token(user.id),
    }
    # tokens go in the URL fragment (#), not the query string (?) — fragments
    # are never sent to any server, so they can't leak into access logs
    frontend_url = f"{settings.FRONTEND_URL}/oauth-callback.html#{urlencode(tokens)}"
    return RedirectResponse(frontend_url, status_code=status.HTTP_302_FOUND)
