"""
Wraps ChromaDB for storing and querying file-level embeddings. Lazily
imported so the rest of the API works even before `pip install chromadb`
has been run — index_repository_files() and query_similar_chunks() are the
two functions the rest of the app calls; everything else is internal.
"""
from app.core.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        import chromadb  # lazy import — heavy dependency, only needed once wired up

        _client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
    return _client


def _get_collection(repository_id: str):
    client = _get_client()
    return client.get_or_create_collection(name=f"repo_{repository_id}")


def index_repository_files(repository_id: str, files: list[dict]) -> None:
    """
    files: [{"id": "...", "path": "...", "content": "..."}, ...]
    Embeds each file's content via the Gemini embedding model and upserts it.
    """
    collection = _get_collection(repository_id)
    documents = [f["content"][:8000] for f in files]  # keep chunks bounded
    metadatas = [{"path": f["path"]} for f in files]
    ids = [f["id"] for f in files]
    collection.upsert(documents=documents, metadatas=metadatas, ids=ids)


def query_similar_chunks(repository_id: str, question: str, top_k: int = 5) -> list[dict]:
    collection = _get_collection(repository_id)
    results = collection.query(query_texts=[question], n_results=top_k)
    chunks = []
    for doc, meta in zip(results.get("documents", [[]])[0], results.get("metadatas", [[]])[0]):
        chunks.append({"path": meta.get("path", "unknown"), "content": doc})
    return chunks
