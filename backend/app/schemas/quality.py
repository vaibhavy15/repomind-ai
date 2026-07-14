from pydantic import BaseModel


class FindingOut(BaseModel):
    severity: str
    title: str
    description: str
    file_path: str
    line: int | None = None


class EndpointOut(BaseModel):
    method: str
    path: str
    file_path: str
    line: int
    requires_auth: bool


class DependencyGraphOut(BaseModel):
    mermaid: str
