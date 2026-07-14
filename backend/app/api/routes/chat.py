import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Conversation, Message, Repository, User
from app.db.session import get_db
from app.schemas.chat import AskRequest, AskResponse, ConversationOut, MessageOut
from app.services import embeddings_service
from app.services.activity_service import log_event
from app.services.gemini_service import generate_answer

router = APIRouter(prefix="/repos/{repo_id}/chat", tags=["chat"])

CITE_RE = re.compile(r"\[\[([^\]]+)\]\]")


def _get_owned_repo(db: Session, repo_id: str, user: User) -> Repository:
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    return repo


@router.post("/ask", response_model=AskResponse)
def ask(
    repo_id: str,
    payload: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = _get_owned_repo(db, repo_id, current_user)
    if repo.status != "indexed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Repository is still {repo.status}")

    if payload.conversation_id:
        conversation = db.get(Conversation, payload.conversation_id)
        if not conversation or conversation.repository_id != repo_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    else:
        conversation = Conversation(repository_id=repo_id, title=payload.question[:60])
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    db.add(Message(conversation_id=conversation.id, role="user", content=payload.question))

    try:
        chunks = embeddings_service.query_similar_chunks(repo_id, payload.question)
    except ImportError:
        chunks = []  # chromadb not installed — Gemini service falls back to its own mock

    user_key = (current_user.preferences or {}).get("gemini_api_key")
    answer = generate_answer(payload.question, chunks, api_key=user_key)
    db.add(Message(conversation_id=conversation.id, role="assistant", content=answer))
    db.commit()
    log_event(db, current_user.id, "question_asked", f"Asked \u201c{payload.question[:80]}\u201d in {repo.name}")

    return AskResponse(
        conversation_id=conversation.id,
        answer=answer,
        cited_files=CITE_RE.findall(answer),
    )


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = _get_owned_repo(db, repo_id, current_user)
    return (
        db.query(Conversation)
        .filter(Conversation.repository_id == repo.id)
        .order_by(Conversation.created_at.desc())
        .all()
    )


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def get_messages(
    repo_id: str,
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_owned_repo(db, repo_id, current_user)
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.repository_id != repo_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation.messages
