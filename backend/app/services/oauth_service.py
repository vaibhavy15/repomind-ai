"""
Real OAuth2 authorization-code flow for GitHub and Google. No third-party
OAuth library — just the standard authorize -> code -> token -> profile
exchange over httpx, which is easy to read and audit end to end.

Requires real credentials from each provider (see backend/README.md for the
exact registration steps). If a provider's client id isn't configured, its
/login route returns a clear 501 instead of a confusing redirect failure.
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt

from app.core.config import settings

PROVIDERS = {
    "github": {
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "scope": "read:user user:email",
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET,
    },
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "openid email profile",
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
    },
}


class OAuthError(Exception):
    pass


def is_configured(provider: str) -> bool:
    cfg = PROVIDERS.get(provider)
    return bool(cfg and cfg["client_id"] and cfg["client_secret"])


def redirect_uri(provider: str) -> str:
    return f"{settings.BACKEND_URL}/api/auth/oauth/{provider}/callback"


def create_state_token() -> str:
    """A short-lived signed token used as the OAuth `state` param — this
    replaces a server-side session store for CSRF protection: the callback
    can verify the state came from us and hasn't expired, without needing
    any shared session storage between the /login and /callback requests."""
    now = datetime.now(timezone.utc)
    payload = {"type": "oauth_state", "iat": now, "exp": now + timedelta(minutes=10)}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_state_token(state: str) -> bool:
    try:
        payload = jwt.decode(state, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("type") == "oauth_state"
    except JWTError:
        return False


def build_authorize_url(provider: str, state: str) -> str:
    cfg = PROVIDERS[provider]
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": redirect_uri(provider),
        "scope": cfg["scope"],
        "state": state,
        "response_type": "code",
    }
    return f"{cfg['authorize_url']}?{urlencode(params)}"


async def exchange_code_for_token(provider: str, code: str) -> str:
    cfg = PROVIDERS[provider]
    data = {
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "code": code,
        "redirect_uri": redirect_uri(provider),
    }
    if provider == "google":
        data["grant_type"] = "authorization_code"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(cfg["token_url"], data=data, headers={"Accept": "application/json"})

    if resp.status_code != 200:
        raise OAuthError(f"{provider} token exchange failed: {resp.text}")

    body = resp.json()
    if "error" in body:
        raise OAuthError(f"{provider} token exchange failed: {body}")
    return body["access_token"]


async def fetch_profile(provider: str, access_token: str) -> dict:
    """Returns a normalized {name, email, oauth_id} regardless of provider."""
    async with httpx.AsyncClient(timeout=10) as client:
        if provider == "github":
            user_resp = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
            )
            if user_resp.status_code != 200:
                raise OAuthError(f"GitHub profile fetch failed: {user_resp.text}")
            user = user_resp.json()

            email = user.get("email")
            if not email:
                # Email is only public on the profile if the user opted in —
                # fall back to the verified-primary email from /user/emails.
                emails_resp = await client.get(
                    "https://api.github.com/user/emails",
                    headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"},
                )
                if emails_resp.status_code == 200:
                    primary = next((e for e in emails_resp.json() if e.get("primary") and e.get("verified")), None)
                    email = primary["email"] if primary else None

            if not email:
                raise OAuthError("GitHub account has no accessible email — grant the user:email scope and retry.")

            return {
                "name": user.get("name") or user.get("login"),
                "email": email,
                "oauth_id": str(user["id"]),
            }

        if provider == "google":
            resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                raise OAuthError(f"Google profile fetch failed: {resp.text}")
            info = resp.json()
            if not info.get("email"):
                raise OAuthError("Google account has no email in its profile.")
            return {
                "name": info.get("name") or info["email"].split("@")[0],
                "email": info["email"],
                "oauth_id": info["sub"],
            }

    raise OAuthError(f"Unknown provider: {provider}")
