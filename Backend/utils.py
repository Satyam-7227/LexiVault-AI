from datetime import datetime, timezone
from bson import ObjectId


def now() -> datetime:
    return datetime.now(timezone.utc)


def public(document: dict) -> dict:
    """Return a browser-safe record without internal MongoDB owner fields."""
    result = document.copy()
    result["id"] = str(result.pop("_id"))
    result.pop("user_id", None)
    for key, value in result.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, list):
            result[key] = [str(v) if isinstance(v, ObjectId) else v for v in value]
    return result


def token_for(user: dict) -> str:
    from datetime import timedelta
    import jwt
    from config import settings
    return jwt.encode(
        {"sub": str(user["_id"]), "exp": now() + timedelta(days=7)},
        settings.jwt_secret,
        algorithm="HS256",
    )
