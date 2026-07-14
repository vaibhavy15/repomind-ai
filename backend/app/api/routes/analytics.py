from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Repository, RepoFile, User
from app.db.session import get_db
from app.services import quality_service

router = APIRouter(prefix="/repos/{repo_id}/analytics", tags=["analytics"])


@router.get("")
def get_analytics(repo_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")

    file_rows = db.query(RepoFile).filter(RepoFile.repository_id == repo_id).all()
    language_counts = Counter(f.language for f in file_rows if f.language)

    # security_score and duplicate_code_pct are computed live from the same
    # detectors that power the Security Findings and Performance tabs, so
    # this number can never drift out of sync with what those tabs show.
    files_for_analysis = [{"path": f.path, "language": f.language, "content": f.content} for f in file_rows]
    findings = quality_service.find_security_findings(files_for_analysis)
    performance_issues = quality_service.find_performance_issues(files_for_analysis)

    return {
        "file_count": repo.file_count,
        "function_count": repo.function_count,
        "class_count": repo.class_count,
        "complexity_score": repo.complexity_score,
        "security_score": quality_service.compute_security_score(findings),
        "duplicate_code_pct": quality_service.compute_duplicate_pct(files_for_analysis, performance_issues),
        "languages": dict(language_counts),
        # documentation_score needs a docstring-presence scanner, which isn't
        # implemented yet — the frontend labels this one "estimated" for now.
    }
