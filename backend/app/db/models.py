import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


def default_preferences() -> dict:
    return {
        "notify_indexing_complete": True,
        "notify_weekly_digest": True,
        "notify_product_updates": False,
        "gemini_api_key": None,
    }


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    # Nullable because OAuth-only users (GitHub/Google) never set a local
    # password — they authenticate entirely through the provider.
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    oauth_provider: Mapped[str | None] = mapped_column(String, nullable=True)  # "github" | "google" | None
    oauth_id: Mapped[str | None] = mapped_column(String, nullable=True)  # provider's stable user id
    plan: Mapped[str] = mapped_column(String, default="solo")
    preferences: Mapped[dict] = mapped_column(JSON, default=default_preferences)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    repositories: Mapped[list["Repository"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    events: Mapped[list["Event"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Event(Base):
    """A lightweight, real activity log — powers the Profile page's 'Recent
    activity' feed and usage counters instead of hardcoded numbers."""
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String)  # e.g. "repo_connected", "question_asked"
    message: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="events")


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    owner_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    source_type: Mapped[str] = mapped_column(String)  # "github" | "zip"
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|indexing|indexed|failed
    failure_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    function_count: Mapped[int] = mapped_column(Integer, default=0)
    class_count: Mapped[int] = mapped_column(Integer, default=0)
    complexity_score: Mapped[float] = mapped_column(Float, default=0.0)
    security_score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["User"] = relationship(back_populates="repositories")
    files: Mapped[list["RepoFile"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="repository", cascade="all, delete-orphan")


class RepoFile(Base):
    """One row per indexed file. embedding_id points at the matching ChromaDB record."""
    __tablename__ = "repo_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    repository_id: Mapped[str] = mapped_column(String, ForeignKey("repositories.id"))
    path: Mapped[str] = mapped_column(String, index=True)
    language: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(Text)
    embedding_id: Mapped[str | None] = mapped_column(String, nullable=True)

    repository: Mapped["Repository"] = relationship(back_populates="files")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    repository_id: Mapped[str] = mapped_column(String, ForeignKey("repositories.id"))
    title: Mapped[str] = mapped_column(String, default="New chat")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    repository: Mapped["Repository"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    conversation_id: Mapped[str] = mapped_column(String, ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
