import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.models import Repository, RepoFile, User
from app.db.session import get_db
from app.schemas.repo import RepoCreateFromUrl, RepoFileOut, RepoOut
from app.services import embeddings_service
from app.services.activity_service import log_event
from app.services.repo_parser import RepoStats, clone_github_repo, parse_uploaded_zip, walk_repo

router = APIRouter(prefix="/repos", tags=["repositories"])


def _persist_parsed_repo(db: Session, repo: Repository, stats: RepoStats) -> None:
    """Writes parsed files to the DB, indexes them into ChromaDB, and updates
    the repository's summary stats. Runs in a background task after the
    initial 202 response so the client can poll /repos/:id for status."""
    try:
        repo.file_count = stats.file_count
        repo.function_count = stats.function_count
        repo.class_count = stats.class_count
        # simple complexity proxy until a real per-function analyzer is added
        repo.complexity_score = round(
            (stats.function_count + stats.class_count * 2) / max(stats.file_count, 1), 2
        )
        repo.security_score = 100.0  # placeholder default; GET /repos/:id/analytics computes the real score live from quality_service

        embed_batch = []
        for f in stats.files:
            row = RepoFile(repository_id=repo.id, path=f.path, language=f.language, content=f.content)
            db.add(row)
            db.flush()  # populate row.id
            embed_batch.append({"id": row.id, "path": row.path, "content": row.content})

        repo.status = "indexed"
        db.commit()

        try:
            embeddings_service.index_repository_files(repo.id, embed_batch)
        except ImportError:
            pass  # chromadb not installed in this environment — indexing skipped, rows still saved
    except Exception:
        repo.status = "failed"
        db.commit()
        raise


@router.post("", response_model=RepoOut, status_code=status.HTTP_202_ACCEPTED)
def connect_from_github(
    payload: RepoCreateFromUrl,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.github_url.rstrip("/").split("/")[-1].removesuffix(".git")
    repo = Repository(owner_id=current_user.id, name=name, source_type="github",
                       source_url=payload.github_url, status="indexing")
    db.add(repo)
    db.commit()
    db.refresh(repo)
    log_event(db, current_user.id, "repo_connected", f"Connected repository \u201c{name}\u201d from GitHub")

    def _run():
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "repo"
            clone_github_repo(payload.github_url, dest)
            stats = walk_repo(dest)
            # needs its own session since this runs after the request's session closes
            from app.db.session import SessionLocal
            session = SessionLocal()
            try:
                repo_row = session.get(Repository, repo.id)
                _persist_parsed_repo(session, repo_row, stats)
            finally:
                session.close()

    background_tasks.add_task(_run)
    return repo


@router.post("/upload", response_model=RepoOut, status_code=status.HTTP_202_ACCEPTED)
def connect_from_zip(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only .zip files are supported")

    name = file.filename.removesuffix(".zip")
    repo = Repository(owner_id=current_user.id, name=name, source_type="zip", status="indexing")
    db.add(repo)
    db.commit()
    db.refresh(repo)
    log_event(db, current_user.id, "repo_connected", f"Connected repository \u201c{name}\u201d from a ZIP upload")

    tmp_zip = Path(tempfile.gettempdir()) / f"repomind_{uuid.uuid4()}.zip"
    tmp_zip.write_bytes(file.file.read())

    def _run():
        from app.db.session import SessionLocal
        session = SessionLocal()
        try:
            stats = parse_uploaded_zip(tmp_zip)
            repo_row = session.get(Repository, repo.id)
            _persist_parsed_repo(session, repo_row, stats)
        finally:
            tmp_zip.unlink(missing_ok=True)
            session.close()

    background_tasks.add_task(_run)
    return repo


@router.get("", response_model=list[RepoOut])
def list_repos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Repository).filter(Repository.owner_id == current_user.id).all()


@router.get("/{repo_id}", response_model=RepoOut)
def get_repo(repo_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    return repo


@router.get("/{repo_id}/files", response_model=list[RepoFileOut])
def list_files(repo_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    return db.query(RepoFile).filter(RepoFile.repository_id == repo_id).all()


@router.get("/{repo_id}/files/content")
def get_file_content(
    repo_id: str,
    path: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")

    file = db.query(RepoFile).filter(RepoFile.repository_id == repo_id, RepoFile.path == path).first()
    if not file:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found in this repository")

    return {"path": file.path, "language": file.language, "content": file.content}


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repo(repo_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    repo = db.get(Repository, repo_id)
    if not repo or repo.owner_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    db.delete(repo)
    db.commit()
