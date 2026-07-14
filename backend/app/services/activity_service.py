"""
Tiny event log. Every call here writes one real row — no hardcoded activity
feed. Called from signup/oauth, repo connect, chat ask, and security-scan
view so Profile's "recent activity" and usage counts reflect what actually
happened, not placeholder numbers.
"""
from sqlalchemy.orm import Session

from app.db.models import Event


def log_event(db: Session, user_id: str, event_type: str, message: str) -> None:
    db.add(Event(user_id=user_id, type=event_type, message=message))
    db.commit()
