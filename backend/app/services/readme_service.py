"""
Generates a real README.md from a repository's actual indexed data — file
tree, detected languages, detected API endpoints, function/class counts.
The project overview paragraph is AI-generated when a Gemini key is
available (server-wide or per-user); every other section is built
directly from real structural data, so the README is useful even in
demo mode, not just a placeholder.
"""
from collections import Counter

from app.core.config import settings
from app.services.quality_service import Endpoint


def _folder_structure(paths: list[str], max_lines: int = 40) -> str:
    """A simple indented tree, built from real file paths."""
    tree: dict = {}
    for p in paths:
        parts = p.split("/")
        node = tree
        for part in parts[:-1]:
            node = node.setdefault(part + "/", {})
        node[parts[-1]] = None

    lines: list[str] = []

    def walk(node: dict, prefix: str = ""):
        for name, child in sorted(node.items(), key=lambda kv: (kv[1] is None, kv[0])):
            if len(lines) >= max_lines:
                return
            lines.append(f"{prefix}{name}")
            if isinstance(child, dict):
                walk(child, prefix + "  ")

    walk(tree)
    if len(paths) > max_lines:
        lines.append("...")
    return "\n".join(lines)


def _overview_paragraph(repo_name: str, languages: dict, endpoints: list[Endpoint], api_key: str | None) -> str:
    if api_key:
        try:
            from google import genai

            top_langs = ", ".join(l for l, _ in Counter(languages).most_common(3))
            prompt = (
                f"Write a concise 2-3 sentence README overview paragraph for a software project named "
                f"'{repo_name}'. It's primarily written in {top_langs or 'an unspecified language'} and "
                f"exposes {len(endpoints)} API endpoint(s). Describe plausibly what the project likely does "
                f"based on this information, in a neutral, professional tone. Do not invent specific feature "
                f"claims you can't support from this information — keep it general and honest about scope."
            )
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(model=settings.GEMINI_MODEL, contents=prompt)
            if response.text:
                return response.text.strip()
        except Exception:
            pass  # fall through to the template overview below

    top_langs = ", ".join(l for l, _ in Counter(languages).most_common(3)) or "multiple languages"
    return (
        f"**{repo_name}** is a software project written primarily in {top_langs}. "
        f"This overview was generated automatically from the repository's structure — set a Gemini API key "
        f"in Settings for an AI-written description grounded in the actual code."
    )


def generate_readme(
    repo_name: str,
    file_paths: list[str],
    languages: dict,
    function_count: int,
    class_count: int,
    endpoints: list[Endpoint],
    api_key: str | None = None,
) -> str:
    lang_list = ", ".join(f"{lang} ({count} files)" for lang, count in Counter(languages).most_common())
    overview = _overview_paragraph(repo_name, languages, endpoints, api_key)

    sections = []
    sections.append(f"# {repo_name}\n")
    sections.append(f"{overview}\n")

    sections.append("## Features\n")
    if endpoints:
        methods = Counter(e.method for e in endpoints)
        method_summary = ", ".join(f"{count} {method}" for method, count in methods.items())
        sections.append(
            f"- Exposes {len(endpoints)} API endpoint{'s' if len(endpoints) != 1 else ''} ({method_summary})\n"
            f"- Built across {len(file_paths)} source files, {function_count} functions, and {class_count} classes\n"
        )
    else:
        sections.append(f"- {len(file_paths)} source files across {len(languages)} language{'s' if len(languages) != 1 else ''}\n"
                         f"- {function_count} functions and {class_count} classes detected\n")

    sections.append("## Installation\n")
    if "Python" in languages:
        sections.append("```bash\npip install -r requirements.txt\n```\n")
    if "JavaScript" in languages or "TypeScript" in languages:
        sections.append("```bash\nnpm install\n```\n")
    if "Python" not in languages and "JavaScript" not in languages and "TypeScript" not in languages:
        sections.append("_Installation steps depend on the project's language — see the source files for the relevant package manager._\n")

    sections.append("## Usage\n")
    sections.append("_Add project-specific usage instructions here — this section is a starting point, not a substitute for real documentation of your entry points._\n")

    sections.append("## Folder Structure\n")
    sections.append("```\n" + _folder_structure(file_paths) + "\n```\n")

    sections.append("## Technologies Used\n")
    sections.append("\n".join(f"- {lang} ({count} files)" for lang, count in Counter(languages).most_common()) + "\n" if languages else "_No languages detected._\n")

    if endpoints:
        sections.append("## API Endpoints\n")
        sections.append("| Method | Path | File |\n|---|---|---|\n" + "\n".join(
            f"| {e.method} | `{e.path}` | `{e.file_path}` |" for e in endpoints[:25]
        ) + "\n")

    sections.append("## License\n")
    sections.append("_Add your license here (e.g. MIT, Apache-2.0) \u2014 no license file was detected in the repository._\n")

    sections.append("---\n_README generated by RepoMind AI from the actual indexed repository structure._\n")

    return "\n".join(sections)
