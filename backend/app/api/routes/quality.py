from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Repository, RepoFile, User
from app.db.session import get_db
from app.schemas.quality import DependencyGraphOut, EndpointOut, FindingOut
from app.services import quality_service
from app.services.activity_service import log_event

router = APIRouter(prefix="/repos/{repo_id}", tags=["quality"])


def _get_indexed_repo_files(db: Session, repo_id: str, user: User) -> list[dict]:
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    if repo.status != "indexed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Repository is still {repo.status}")

    rows = db.query(RepoFile).filter(RepoFile.repository_id == repo_id).all()
    return [{"path": r.path, "language": r.language, "content": r.content} for r in rows]


@router.get("/security", response_model=list[FindingOut])
def get_security_findings(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    files = _get_indexed_repo_files(db, repo_id, current_user)
    findings = quality_service.find_security_findings(files)
    log_event(db, current_user.id, "security_scan_viewed", f"Viewed security findings for a repository")
    return findings


@router.get("/performance", response_model=list[FindingOut])
def get_performance_issues(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    files = _get_indexed_repo_files(db, repo_id, current_user)
    return quality_service.find_performance_issues(files)


@router.get("/api-endpoints", response_model=list[EndpointOut])
def get_api_endpoints(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    files = _get_indexed_repo_files(db, repo_id, current_user)
    return quality_service.find_api_endpoints(files)


@router.get("/dependency-graph", response_model=DependencyGraphOut)
def get_dependency_graph(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    files = _get_indexed_repo_files(db, repo_id, current_user)
    return DependencyGraphOut(mermaid=quality_service.build_dependency_graph(files))
