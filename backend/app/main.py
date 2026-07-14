from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analytics, auth, chat, oauth, quality, repos
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine

# dev convenience only — use Alembic migrations for anything beyond local dev
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(oauth.router, prefix="/api")
app.include_router(repos.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(quality.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}
