from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Repository, RepoFile, User
from app.db.session import get_db

router = APIRouter(prefix="/repos/{repo_id}/analytics", tags=["analytics"])


@router.get("")
def get_analytics(repo_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")

    files = db.query(RepoFile).filter(RepoFile.repository_id == repo_id).all()
    language_counts = Counter(f.language for f in files if f.language)

    return {
        "file_count": repo.file_count,
        "function_count": repo.function_count,
        "class_count": repo.class_count,
        "complexity_score": repo.complexity_score,
        "security_score": repo.security_score,
        "languages": dict(language_counts),
        # duplicate_code_pct, documentation_score, and technical_debt need a
        # dedicated static-analysis pass — wire up services/quality_service.py
        # (not yet implemented) and populate these from its output.
    }
