from datetime import datetime

from pydantic import BaseModel, Field


class RepoCreateFromUrl(BaseModel):
    github_url: str = Field(min_length=1)


class RepoOut(BaseModel):
    id: str
    name: str
    source_type: str
    status: str
    file_count: int
    function_count: int
    class_count: int
    complexity_score: float
    security_score: float
    created_at: datetime

    class Config:
        from_attributes = True


class RepoFileOut(BaseModel):
    path: str
    language: str | None

    class Config:
        from_attributes = True
