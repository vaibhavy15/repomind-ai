"""
Wraps calls to Gemini 2.5 Flash. If GEMINI_API_KEY is unset (e.g. running the
demo without credentials), falls back to a canned response so the rest of the
stack — routes, DB writes, the frontend — can be exercised end to end.

To go live: `pip install google-genai`, set GEMINI_API_KEY, and this module
starts making real calls with no other code changes required.
"""
from app.core.config import settings

SYSTEM_PROMPT = (
    "You are RepoMind AI, a senior engineer explaining an unfamiliar codebase. "
    "Answer only from the provided file context. Cite the exact file path for "
    "every claim using [[path/to/file]] syntax. If the context doesn't contain "
    "the answer, say so instead of guessing."
)


def _mock_answer(question: str, context_chunks: list[dict]) -> str:
    files = ", ".join(f"[[{c['path']}]]" for c in context_chunks[:3]) or "[[no matching files indexed]]"
    return (
        f"(demo mode — no GEMINI_API_KEY set) Based on the indexed context, "
        f"this would normally be answered by Gemini 2.5 Flash using the most "
        f"relevant chunks from {files}. Set GEMINI_API_KEY in your .env to get "
        f"real answers to: \"{question}\""
    )


def generate_answer(question: str, context_chunks: list[dict], api_key: str | None = None) -> str:
    """
    context_chunks: [{"path": "auth/jwt.py", "content": "...snippet..."}, ...]
    as retrieved from ChromaDB via embeddings_service.query_similar_chunks().

    api_key: pass a user's own key (from User.preferences["gemini_api_key"],
    set via Settings) to use it instead of the server-wide GEMINI_API_KEY.
    """
    key = api_key or settings.GEMINI_API_KEY
    if not key:
        return _mock_answer(question, context_chunks)

    try:
        from google import genai  # lazy import — only required in production
    except ImportError:
        return _mock_answer(question, context_chunks)

    client = genai.Client(api_key=key)
    context_text = "\n\n".join(f"### {c['path']}\n{c['content']}" for c in context_chunks)
    prompt = f"{SYSTEM_PROMPT}\n\n--- CODEBASE CONTEXT ---\n{context_text}\n\n--- QUESTION ---\n{question}"

    response = client.models.generate_content(model=settings.GEMINI_MODEL, contents=prompt)
    return response.text
