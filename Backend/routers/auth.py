import bcrypt
from fastapi import APIRouter, HTTPException
from database import db
from models import LoginBody, RegisterBody
from utils import now, token_for

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register(body: RegisterBody):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists.")
    user = {
        "name": body.name.strip(),
        "email": email,
        "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
        "created_at": now(),
        "email_verified": False,
    }
    result = await db.users.insert_one(user)
    user["_id"] = result.inserted_id
    return {
        "token": token_for(user),
        "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"]},
    }


@router.post("/login")
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Incorrect email or password.")
    return {
        "token": token_for(user),
        "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"]},
    }


@router.get("/me")
async def me(user: dict = None):
    # Will use Depends in main.py after import to avoid circular deps
    from deps import current_user
    from fastapi import Depends
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}
