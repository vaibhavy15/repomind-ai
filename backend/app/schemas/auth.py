from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    plan: str
    oauth_provider: str | None = None
    preferences: dict = {}
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateMeRequest(BaseModel):
    """All fields optional — only the ones sent are updated."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    notify_indexing_complete: bool | None = None
    notify_weekly_digest: bool | None = None
    notify_product_updates: bool | None = None
    gemini_api_key: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None  # not required for OAuth-only accounts setting a password for the first time
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class EventOut(BaseModel):
    id: str
    type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True
