from datetime import datetime

from pydantic import BaseModel


class AskRequest(BaseModel):
    conversation_id: str | None = None
    question: str


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


class AskResponse(BaseModel):
    conversation_id: str
    answer: str
    cited_files: list[str]
