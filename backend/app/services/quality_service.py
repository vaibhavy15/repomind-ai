"""
Lightweight, real static analysis over a repo's already-indexed files. This
is intentionally heuristic — regexes and AST pattern matching, not a full
SAST/dataflow engine — but every finding here is computed from the actual
file contents in the database, not hardcoded demo data.

Python gets the deepest analysis (AST-based) since that's what repo_parser.py
already parses accurately. JavaScript/TypeScript get regex-based heuristics.
Other languages are skipped for now rather than given unreliable results.
"""
import ast
import re
from collections import defaultdict
from dataclasses import dataclass

# -- security: hardcoded secrets ------------------------------------------
_SECRET_ASSIGN_RE = re.compile(
    r'(?i)\b(api[_-]?key|secret[_-]?key|access[_-]?token|password|passwd|private[_-]?key)\b\s*[:=]\s*'
    r'["\']([A-Za-z0-9_\-/+=]{8,})["\']'
)
_PLACEHOLDER_RE = re.compile(r'(?i)^(your|change[_-]?me|xxx+|placeholder|example|<.*>|\{\{.*\}\}|test|demo|fake)')
_ENV_LOOKUP_NEARBY_RE = re.compile(r'(?i)os\.(environ|getenv)|process\.env|ENV\[')


@dataclass
class Finding:
    severity: str  # "high" | "medium" | "low"
    title: str
    description: str
    file_path: str
    line: int | None = None


@dataclass
class Endpoint:
    method: str
    path: str
    file_path: str
    line: int
    requires_auth: bool


def _line_of(content: str, offset: int) -> int:
    return content.count("\n", 0, offset) + 1


def find_security_findings(files: list[dict]) -> list[Finding]:
    """files: [{"path": ..., "language": ..., "content": ...}, ...]"""
    findings: list[Finding] = []

    for f in files:
        content = f["content"]
        lower_path = f["path"].lower()

        # -- hardcoded secrets --
        for m in _SECRET_ASSIGN_RE.finditer(content):
            value = m.group(2)
            if _PLACEHOLDER_RE.match(value):
                continue
            if _ENV_LOOKUP_NEARBY_RE.search(content[max(0, m.start() - 80):m.start()]):
                continue  # e.g. `api_key = os.getenv("API_KEY", "sk-...")` default — lower signal, skip
            findings.append(Finding(
                severity="high",
                title=f"Possible hardcoded secret ({m.group(1)})",
                description="A string literal is assigned directly to what looks like a credential, instead of being loaded from environment/config.",
                file_path=f["path"],
                line=_line_of(content, m.start()),
            ))

        # -- Python-specific checks via AST --
        if f["language"] == "Python":
            try:
                tree = ast.parse(content)
            except SyntaxError:
                tree = None
            if tree:
                for node in ast.walk(tree):
                    if isinstance(node, ast.Call):
                        func_name = _call_name(node)
                        if func_name and "decode" in func_name:
                            for kw in node.keywords:
                                if kw.arg == "verify" and isinstance(kw.value, ast.Constant) and kw.value.value is False:
                                    findings.append(Finding(
                                        severity="high",
                                        title="JWT/token verification explicitly disabled",
                                        description=f"`{func_name}(...)` is called with verify=False, which skips signature validation entirely.",
                                        file_path=f["path"],
                                        line=node.lineno,
                                    ))
                        if func_name in ("eval", "exec", "pickle.loads"):
                            findings.append(Finding(
                                severity="medium",
                                title=f"Use of {func_name}()",
                                description=f"`{func_name}()` can execute arbitrary code if its input isn't fully trusted.",
                                file_path=f["path"],
                                line=node.lineno,
                            ))

                    if isinstance(node, ast.JoinedStr):
                        rendered = ast.dump(node)
                        if re.search(r"(?i)(select|insert|update|delete)\b.*\bfrom\b|\bwhere\b", rendered):
                            findings.append(Finding(
                                severity="medium",
                                title="SQL string built with an f-string",
                                description="Interpolating values directly into a SQL string is injection-prone — use parameterized queries instead.",
                                file_path=f["path"],
                                line=node.lineno,
                            ))

        if "login" in lower_path and "slowapi" not in content and "ratelimit" not in content.lower() and "rate_limit" not in content.lower():
            findings.append(Finding(
                severity="low",
                title="No visible rate limiting near login logic",
                description=f"{f['path']} handles login-like logic but no rate-limiting library or decorator was found in the file.",
                file_path=f["path"],
            ))

    return findings


def _call_name(node: ast.Call) -> str | None:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        parts = []
        cur = node.func
        while isinstance(cur, ast.Attribute):
            parts.append(cur.attr)
            cur = cur.value
        if isinstance(cur, ast.Name):
            parts.append(cur.id)
        return ".".join(reversed(parts))
    return None


def _group_duplicate_functions(files: list[dict]) -> dict[str, list[tuple[str, str, int]]]:
    """fingerprint -> [(file_path, function_name, line), ...] for every
    Python function, so callers can find groups with len() > 1."""
    groups: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for f in files:
        if f["language"] != "Python":
            continue
        try:
            tree = ast.parse(f["content"])
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                fingerprint = _structural_fingerprint(node)
                groups[fingerprint].append((f["path"], node.name, node.lineno))
    return groups


# -- performance: unused imports, deep nesting, duplicate functions ------
def find_performance_issues(files: list[dict]) -> list[Finding]:
    issues: list[Finding] = []

    for f in files:
        if f["language"] != "Python":
            continue
        content = f["content"]
        try:
            tree = ast.parse(content)
        except SyntaxError:
            continue

        imported_names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported_names.add((alias.asname or alias.name).split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    imported_names.add(alias.asname or alias.name)

        used_names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        used_names |= {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
        for unused in imported_names - used_names:
            if unused == "*":
                continue
            issues.append(Finding(
                severity="low",
                title=f"Possibly unused import: {unused}",
                description=f"`{unused}` is imported in {f['path']} but never referenced elsewhere in the file.",
                file_path=f["path"],
            ))

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                depth = _max_loop_nesting(node)
                if depth >= 3:
                    issues.append(Finding(
                        severity="medium",
                        title=f"Deeply nested loops in {node.name}()",
                        description=f"{depth} levels of nested loops — a common source of O(n^{depth}) behavior on large inputs.",
                        file_path=f["path"],
                        line=node.lineno,
                    ))

    for fingerprint, occurrences in _group_duplicate_functions(files).items():
        if len(occurrences) > 1:
            files_involved = ", ".join(f"{path}:{name}" for path, name, _ in occurrences[:3])
            # one Finding per group, but every file in the group is a real
            # duplicate — compute_duplicate_pct() re-derives the full set
            # rather than relying on this single representative file_path
            issues.append(Finding(
                severity="low",
                title="Duplicated function logic",
                description=f"{len(occurrences)} functions share near-identical structure: {files_involved}. Consider extracting a shared helper.",
                file_path=occurrences[0][0],
                line=occurrences[0][2],
            ))

    return issues


def _max_loop_nesting(node: ast.AST, current: int = 0) -> int:
    best = current
    for child in ast.iter_child_nodes(node):
        depth = current + 1 if isinstance(child, (ast.For, ast.While)) else current
        best = max(best, _max_loop_nesting(child, depth))
    return best


def _structural_fingerprint(node) -> str:
    """A rough shape signature: node types in order, ignoring identifiers/
    literals, so two functions with different variable names but the same
    control-flow shape hash the same. Skips trivial (very short) functions
    since those collide constantly and aren't meaningful duplicates."""
    types = [type(n).__name__ for n in ast.walk(node)]
    if len(types) < 8:
        return f"__trivial_{id(node)}__"
    return ",".join(types)


def compute_security_score(findings: list[Finding]) -> float:
    """100, minus a deduction per finding weighted by severity. Floored at 0.
    Deliberately simple and explainable — not a substitute for a real risk
    model, but at least it's derived from the same findings shown to the user
    instead of being a disconnected constant."""
    deductions = {"high": 15, "medium": 7, "low": 2}
    score = 100 - sum(deductions.get(f.severity, 2) for f in findings)
    return float(max(0, score))


def compute_duplicate_pct(files: list[dict], performance_issues: list[Finding]) -> float:
    """Share of Python files that contain at least one function belonging to
    a structurally-duplicated group. Every file in each duplicate cluster
    counts — not just the first one a Finding happens to point at."""
    py_files = [f for f in files if f["language"] == "Python"]
    if not py_files:
        return 0.0
    flagged_files: set[str] = set()
    for occurrences in _group_duplicate_functions(files).values():
        if len(occurrences) > 1:
            flagged_files.update(path for path, _, _ in occurrences)
    return round(100 * len(flagged_files) / len(py_files), 1)


# -- bugs: common real Python bug patterns, AST-based ---------------------
def find_potential_bugs(files: list[dict]) -> list[Finding]:
    """Classic, well-understood bug shapes — the kind flake8/pylint also
    flag — detected via ast rather than text matching, so they're accurate
    rather than guessed."""
    bugs: list[Finding] = []

    for f in files:
        if f["language"] != "Python":
            continue
        try:
            tree = ast.parse(f["content"])
        except SyntaxError:
            continue

        for node in ast.walk(tree):
            # bare `except:` swallows every exception, including Ctrl+C and real bugs
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                bugs.append(Finding(
                    severity="medium",
                    title="Bare except clause",
                    description="`except:` with no exception type catches everything, including KeyboardInterrupt and SystemExit — it silently hides bugs that should crash loudly.",
                    file_path=f["path"], line=node.lineno,
                ))

            # mutable default arguments are shared across every call, a classic footgun
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for default in node.args.defaults + node.args.kw_defaults:
                    if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                        bugs.append(Finding(
                            severity="medium",
                            title=f"Mutable default argument in {node.name}()",
                            description="A list/dict/set default is created once and shared across every call to this function, not recreated per-call — a frequent source of bugs that only show up after the function is called more than once.",
                            file_path=f["path"], line=node.lineno,
                        ))

            # `== None` / `== True` / `== False` should be identity checks
            if isinstance(node, ast.Compare):
                for op, comparator in zip(node.ops, node.comparators):
                    if isinstance(op, (ast.Eq, ast.NotEq)) and isinstance(comparator, ast.Constant) and comparator.value in (None, True, False):
                        bugs.append(Finding(
                            severity="low",
                            title=f"Comparison with {comparator.value!r} using ==",
                            description=f"Use `is` / `is not` to compare with {comparator.value!r} instead of `==` / `!=` — equality operators can be overridden and give surprising results here.",
                            file_path=f["path"], line=node.lineno,
                        ))

            # unreachable code: any statement immediately after return/raise/break/continue in the same block
            body_lists = [n for n in (getattr(node, "body", None), getattr(node, "orelse", None), getattr(node, "finalbody", None)) if n]
            for stmts in body_lists:
                for i, stmt in enumerate(stmts[:-1]):
                    if isinstance(stmt, (ast.Return, ast.Raise, ast.Break, ast.Continue)):
                        bugs.append(Finding(
                            severity="low",
                            title="Unreachable code",
                            description=f"Code after this {type(stmt).__name__.lower()} statement can never execute.",
                            file_path=f["path"], line=stmts[i + 1].lineno,
                        ))

    return bugs


# -- overall quality score + synthesized recommendations ------------------
def compute_quality_score(security_score: float, bug_count: int, performance_issue_count: int, file_count: int) -> float:
    """A single headline number for the Code Analyzer. Starts from the
    security score (already 0-100) and applies a mild density-based penalty
    for bugs/performance issues, so a huge repo with a handful of issues
    isn't penalized as hard as a tiny one riddled with them."""
    if file_count == 0:
        return security_score
    density_penalty = min(30, ((bug_count * 2) + performance_issue_count) / max(file_count, 1) * 10)
    return round(max(0.0, security_score - density_penalty), 1)


def synthesize_recommendations(security_findings, bugs, performance_issues, duplicate_pct: float) -> list[str]:
    """Plain-language recommendations derived from the actual counts above —
    not a canned list, so it changes (and can go empty) based on real findings."""
    recs: list[str] = []
    high_sec = sum(1 for x in security_findings if x.severity == "high")
    if high_sec:
        recs.append(f"Address {high_sec} high-severity security finding{'s' if high_sec != 1 else ''} before deploying — see the Security tab for exact file locations.")
    bare_excepts = sum(1 for x in bugs if x.title == "Bare except clause")
    if bare_excepts:
        recs.append(f"Replace {bare_excepts} bare `except:` clause{'s' if bare_excepts != 1 else ''} with a specific exception type so real errors don't get silently swallowed.")
    unused_imports = sum(1 for x in performance_issues if x.title.startswith("Possibly unused import"))
    if unused_imports:
        recs.append(f"Remove {unused_imports} unused import{'s' if unused_imports != 1 else ''} to reduce noise and speed up module load slightly.")
    if duplicate_pct >= 15:
        recs.append(f"{duplicate_pct}% of files contain a structurally duplicated function — consider extracting shared logic into a common module.")
    nested_loops = sum(1 for x in performance_issues if "nested loops" in x.title)
    if nested_loops:
        recs.append(f"{nested_loops} function{'s have' if nested_loops != 1 else ' has'} deeply nested loops — worth profiling if this repo processes large inputs.")
    if not recs:
        recs.append("No significant issues found by the current checks — that's a good sign, though it isn't a substitute for a full manual review.")
    return recs


# -- API endpoint detection (FastAPI/Flask-style decorators) --------------
_ROUTE_RE = re.compile(
    r'@(?:\w+\.)?(?:router|app)\.(get|post|put|patch|delete)\(\s*["\']([^"\']+)["\']', re.IGNORECASE
)
_AUTH_HINT_RE = re.compile(
    r'Depends\(\s*\w*(get_current_user|current_user|require_auth|auth_required|verify|authenticate)\w*\s*\)'
    r'|@login_required|require_auth\(',
    re.IGNORECASE,
)


def find_api_endpoints(files: list[dict]) -> list[Endpoint]:
    endpoints: list[Endpoint] = []
    for f in files:
        if f["language"] != "Python":
            continue
        content = f["content"]
        for m in _ROUTE_RE.finditer(content):
            window = content[m.end():m.end() + 300]
            endpoints.append(Endpoint(
                method=m.group(1).upper(),
                path=m.group(2),
                file_path=f["path"],
                line=_line_of(content, m.start()),
                requires_auth=bool(_AUTH_HINT_RE.search(window)),
            ))
    return endpoints


# -- dependency graph (Python imports resolved to in-repo files) -----------
def build_dependency_graph(files: list[dict], max_nodes: int = 18) -> str:
    """Returns a Mermaid `graph LR` definition built from real import
    statements, resolved to other indexed files by module-path matching.
    Falls back to a friendly placeholder diagram if there's nothing to draw."""
    py_files = [f for f in files if f["language"] == "Python"]
    module_to_path = {}
    for f in py_files:
        module = f["path"][:-3].replace("/", ".") if f["path"].endswith(".py") else f["path"].replace("/", ".")
        module_to_path[module] = f["path"]
        module_to_path[module.split(".")[-1]] = f["path"]

    edges: set[tuple[str, str]] = set()
    for f in py_files:
        try:
            tree = ast.parse(f["content"])
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            targets = []
            if isinstance(node, ast.Import):
                targets = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                targets = [node.module]
            for t in targets:
                candidate = module_to_path.get(t) or module_to_path.get(t.split(".")[-1])
                if candidate and candidate != f["path"]:
                    edges.add((f["path"], candidate))

    if not edges:
        return (
            "flowchart LR\n"
            "    A[No resolvable in-repo imports found] --> B[Diagram populates once\\nPython files import each other by name]"
        )

    degree = defaultdict(int)
    for a, b in edges:
        degree[a] += 1
        degree[b] += 1
    keep_nodes = {n for n, _ in sorted(degree.items(), key=lambda kv: -kv[1])[:max_nodes]}
    kept_edges = [(a, b) for a, b in edges if a in keep_nodes and b in keep_nodes]

    def node_id(path: str) -> str:
        return re.sub(r"[^a-zA-Z0-9]", "_", path)

    lines = ["graph LR"]
    for a, b in sorted(kept_edges):
        lines.append(f'    {node_id(a)}["{a}"] --> {node_id(b)}["{b}"]')
    return "\n".join(lines)
