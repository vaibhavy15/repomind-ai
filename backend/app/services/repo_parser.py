"""
Real filesystem walking + basic static analysis. GitHub cloning shells out to
`git`; ZIP uploads are extracted by the caller before this runs. Python gets
proper function/class counts via `ast`; other languages get a language tag
and a rough function-count heuristic (regex) — swap in tree-sitter for
production-grade multi-language parsing.
"""
import ast
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

IGNORED_DIRS = {".git", "node_modules", "__pycache__", "venv", ".venv", "dist", "build", ".next"}
LANGUAGE_BY_EXT = {
    ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript",
    ".jsx": "JavaScript", ".go": "Go", ".rs": "Rust", ".java": "Java", ".rb": "Ruby",
    ".md": "Markdown", ".json": "JSON", ".yml": "YAML", ".yaml": "YAML", ".sql": "SQL",
}
MAX_FILE_BYTES = 400_000  # skip anything absurdly large (binaries, lockfiles, etc.)


@dataclass
class ParsedFile:
    path: str
    language: str | None
    content: str


@dataclass
class RepoStats:
    files: list[ParsedFile] = field(default_factory=list)
    file_count: int = 0
    function_count: int = 0
    class_count: int = 0
    languages: dict = field(default_factory=dict)  # language -> file count


def clone_github_repo(url: str, dest: Path, github_token: str | None = None) -> Path:
    """Shallow-clones a repo. Raises subprocess.CalledProcessError on failure
    (private repo without a token, bad URL, etc.)."""
    clone_url = url
    if github_token and url.startswith("https://github.com/"):
        clone_url = url.replace("https://", f"https://x-access-token:{github_token}@")
    subprocess.run(["git", "clone", "--depth", "1", clone_url, str(dest)], check=True, capture_output=True)
    return dest


def _count_python_defs(source: str) -> tuple[int, int]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return 0, 0
    functions = sum(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) for n in ast.walk(tree))
    classes = sum(isinstance(n, ast.ClassDef) for n in ast.walk(tree))
    return functions, classes


_JS_FUNC_RE = re.compile(r"\bfunction\s+\w+\s*\(|=>\s*{|\basync\s+function\b")
_JS_CLASS_RE = re.compile(r"\bclass\s+\w+")


def walk_repo(root: Path) -> RepoStats:
    stats = RepoStats()

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.parts):
            continue
        if path.stat().st_size > MAX_FILE_BYTES:
            continue

        ext = path.suffix.lower()
        language = LANGUAGE_BY_EXT.get(ext)
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        rel_path = str(path.relative_to(root))
        stats.files.append(ParsedFile(path=rel_path, language=language, content=content))
        stats.file_count += 1
        if language:
            stats.languages[language] = stats.languages.get(language, 0) + 1

        if ext == ".py":
            fn, cls = _count_python_defs(content)
            stats.function_count += fn
            stats.class_count += cls
        elif ext in (".ts", ".tsx", ".js", ".jsx"):
            stats.function_count += len(_JS_FUNC_RE.findall(content))
            stats.class_count += len(_JS_CLASS_RE.findall(content))

    return stats


def parse_uploaded_zip(zip_path: Path) -> RepoStats:
    import zipfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp_path)
        return walk_repo(tmp_path)
