from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analytics, auth, chat, oauth, quality, repos
from app.core.config import settings

# Schema is managed by Alembic now, not an implicit create_all() at startup.
# Run `alembic upgrade head` before starting the server (see README) — this
# is what actually fixes the "column X does not exist" class of error for
# good, instead of silently doing nothing when tables already exist but are
# missing a newly-added column (which is exactly what create_all() did).

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
