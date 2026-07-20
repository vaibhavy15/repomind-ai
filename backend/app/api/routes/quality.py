from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import Repository, RepoFile, User
from app.db.session import get_db
from app.schemas.quality import DependencyGraphOut, EndpointOut, FindingOut
from app.services import quality_service, readme_service
from app.services.activity_service import log_event

router = APIRouter(prefix="/repos/{repo_id}", tags=["quality"])


def _get_indexed_repo(db: Session, repo_id: str, user: User) -> Repository:
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    if repo.status != "indexed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Repository is still {repo.status}")
    return repo


def _get_indexed_repo_files(db: Session, repo_id: str, user: User) -> list[dict]:
    _get_indexed_repo(db, repo_id, user)
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


@router.get("/code-analysis")
def get_code_analysis(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Everything the Code Analyzer page needs in one call: quality score,
    complexity, bugs, security issues, performance suggestions, synthesized
    recommendations, and duplicate-code percentage — all computed live from
    the same detectors as the Analytics page, so the two can never drift."""
    repo = _get_indexed_repo(db, repo_id, current_user)
    files = [{"path": r.path, "language": r.language, "content": r.content}
             for r in db.query(RepoFile).filter(RepoFile.repository_id == repo_id).all()]

    security_findings = quality_service.find_security_findings(files)
    performance_issues = quality_service.find_performance_issues(files)
    bugs = quality_service.find_potential_bugs(files)
    security_score = quality_service.compute_security_score(security_findings)
    duplicate_pct = quality_service.compute_duplicate_pct(files, performance_issues)
    quality_score = quality_service.compute_quality_score(security_score, len(bugs), len(performance_issues), repo.file_count)
    recommendations = quality_service.synthesize_recommendations(security_findings, bugs, performance_issues, duplicate_pct)

    return {
        "quality_score": quality_score,
        "complexity_score": repo.complexity_score,
        "function_count": repo.function_count,
        "class_count": repo.class_count,
        "file_count": repo.file_count,
        "security_score": security_score,
        "duplicate_code_pct": duplicate_pct,
        "bugs": bugs,
        "security_issues": security_findings,
        "performance_suggestions": performance_issues,
        "recommendations": recommendations,
    }


@router.get("/readme")
def get_readme(
    repo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = _get_indexed_repo(db, repo_id, current_user)
    file_rows = db.query(RepoFile).filter(RepoFile.repository_id == repo_id).all()
    files = [{"path": r.path, "language": r.language, "content": r.content} for r in file_rows]
    endpoints = quality_service.find_api_endpoints(files)

    from collections import Counter
    languages = dict(Counter(r.language for r in file_rows if r.language))

    user_key = (current_user.preferences or {}).get("gemini_api_key")
    markdown = readme_service.generate_readme(
        repo_name=repo.name,
        file_paths=[r.path for r in file_rows],
        languages=languages,
        function_count=repo.function_count,
        class_count=repo.class_count,
        endpoints=endpoints,
        api_key=user_key,
    )
    log_event(db, current_user.id, "readme_generated", f"Generated a README for {repo.name}")
    return {"markdown": markdown}
