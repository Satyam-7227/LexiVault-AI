import json
import random
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal

import bcrypt
import httpx
import jwt
from bson import ObjectId
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str
    mongodb_database: str = "lexivault_ai"
    jwt_secret: str
    frontend_url: str = "http://localhost:5173"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    upload_dir: str = "uploads"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
app = FastAPI(title="LexiVault AI API")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
client = AsyncIOMotorClient(settings.mongodb_uri)
db: AsyncIOMotorDatabase = client[settings.mongodb_database]
security = HTTPBearer()
UPLOAD_PATH = Path(settings.upload_dir)
UPLOAD_PATH.mkdir(parents=True, exist_ok=True)
quiz_cache: dict[str, dict] = {}


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
    return result


def token_for(user: dict) -> str:
    return jwt.encode({"sub": str(user["_id"]), "exp": now() + timedelta(days=7)}, settings.jwt_secret, algorithm="HS256")


async def current_user(credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except (jwt.PyJWTError, ValueError):
        user = None
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again.")
    return user


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ExplainBody(BaseModel):
    word: str = Field(min_length=1, max_length=80)


class VocabularyBody(BaseModel):
    word: str
    meaning: str
    simpleExplanation: str
    synonyms: list[str] = []
    exampleSentence: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    documentId: str | None = None


class QuizAnswer(BaseModel):
    wordId: str
    selectedIndex: int


class QuizSubmitBody(BaseModel):
    quizId: str
    answers: list[QuizAnswer]


@app.on_event("startup")
async def indexes():
    await db.users.create_index("email", unique=True)
    await db.vocabulary.create_index([("user_id", 1), ("normalized_word", 1)], unique=True)


@app.post("/api/auth/register")
async def register(body: RegisterBody):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists.")
    user = {"name": body.name.strip(), "email": email, "password_hash": bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(), "created_at": now()}
    result = await db.users.insert_one(user)
    user["_id"] = result.inserted_id
    return {"token": token_for(user), "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}}


@app.post("/api/auth/login")
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "Incorrect email or password.")
    return {"token": token_for(user), "user": {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}}


@app.get("/api/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...), user: dict = Depends(current_user)):
    if file.content_type != "application/pdf" or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Please upload a PDF file.")
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename)
    target = UPLOAD_PATH / f"{ObjectId()}_{safe_name}"
    with target.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    if target.stat().st_size > 20 * 1024 * 1024:
        target.unlink(missing_ok=True)
        raise HTTPException(400, "PDF must be smaller than 20 MB.")
    document = {"user_id": user["_id"], "original_name": file.filename, "file_path": str(target.resolve()), "uploaded_at": now()}
    result = await db.documents.insert_one(document)
    document["_id"] = result.inserted_id
    return public(document)


@app.get("/api/documents")
async def documents(user: dict = Depends(current_user)):
    return [public(item) async for item in db.documents.find({"user_id": user["_id"]}).sort("uploaded_at", -1)]


@app.get("/api/documents/{document_id}/file")
async def document_file(document_id: str, user: dict = Depends(current_user)):
    from fastapi.responses import FileResponse
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document or not Path(document["file_path"]).exists():
        raise HTTPException(404, "Document not found.")
    return FileResponse(document["file_path"], media_type="application/pdf", filename=document["original_name"])


@app.post("/api/ai/explain")
async def explain(body: ExplainBody, user: dict = Depends(current_user)):
    word = re.sub(r"[^A-Za-z'-]", "", body.word).strip()
    if not word:
        raise HTTPException(400, "Enter a valid English word.")
    prompt = f'''Explain the English word "{word}" for a student. Return ONLY valid JSON with exactly these keys: word, meaning, simpleExplanation, synonyms, exampleSentence, difficulty. difficulty must be Easy, Medium, or Hard. synonyms must be an array of 2 to 4 strings. Keep every field concise and in English.'''
    try:
        async with httpx.AsyncClient(timeout=60) as http:
            response = await http.post(f"{settings.ollama_base_url}/api/generate", json={"model": settings.ollama_model, "prompt": prompt, "stream": False, "format": "json"})
            response.raise_for_status()
        data = json.loads(response.json()["response"])
        required = {"word", "meaning", "simpleExplanation", "synonyms", "exampleSentence", "difficulty"}
        if not required.issubset(data) or data["difficulty"] not in {"Easy", "Medium", "Hard"}:
            raise ValueError("Unexpected AI response")
        return data
    except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValueError):
        raise HTTPException(503, "LexiVault AI could not reach Ollama. Ensure Ollama is running and qwen2.5:3b is installed, then try again.")


@app.post("/api/vocabulary")
async def save_vocabulary(body: VocabularyBody, user: dict = Depends(current_user)):
    normalized = body.word.strip().lower()
    document_id = ObjectId(body.documentId) if body.documentId else None
    record = {"user_id": user["_id"], "normalized_word": normalized, "word": body.word.strip(), "meaning": body.meaning, "simple_explanation": body.simpleExplanation, "synonyms": body.synonyms, "example_sentence": body.exampleSentence, "difficulty": body.difficulty, "document_id": document_id, "saved_at": now(), "last_revised_at": now(), "revision_count": 0, "needs_revision": False}
    await db.vocabulary.update_one({"user_id": user["_id"], "normalized_word": normalized}, {"$set": record}, upsert=True)
    saved = await db.vocabulary.find_one({"user_id": user["_id"], "normalized_word": normalized})
    return public(saved)


@app.get("/api/vocabulary")
async def vocabulary(search: str = "", user: dict = Depends(current_user)):
    query = {"user_id": user["_id"]}
    if search:
        query["word"] = {"$regex": re.escape(search), "$options": "i"}
    return [public(item) async for item in db.vocabulary.find(query).sort("saved_at", -1)]


@app.get("/api/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    total = await db.vocabulary.count_documents({"user_id": user["_id"]})
    revise = await db.vocabulary.count_documents({"user_id": user["_id"], "$or": [{"needs_revision": True}, {"last_revised_at": {"$lt": now() - timedelta(days=3)}}]})
    last_quiz = await db.quiz_attempts.find_one({"user_id": user["_id"]}, sort=[("completed_at", -1)])
    since_quiz = total
    if last_quiz:
        since_quiz = await db.vocabulary.count_documents({"user_id": user["_id"], "saved_at": {"$gt": last_quiz["completed_at"]}})
    return {"wordsLearned": total, "reviseToday": revise, "newWordsSinceQuiz": since_quiz, "lastQuizScore": last_quiz.get("score") if last_quiz else None}


@app.get("/api/quiz")
async def generate_quiz(user: dict = Depends(current_user)):
    words = [item async for item in db.vocabulary.find({"user_id": user["_id"]}).sort("saved_at", -1).limit(12)]
    if len(words) < 5:
        raise HTTPException(400, "Save at least five words before starting a quiz.")
    questions = []
    answer_key: dict[str, int] = {}
    for index, word in enumerate(words[:5]):
        pool = [item for item in words if item["_id"] != word["_id"]]
        distractors = [item["meaning"] for item in pool[:3]]
        choices = [word["meaning"], *distractors]
        random.shuffle(choices)
        word_id = str(word["_id"])
        answer_key[word_id] = choices.index(word["meaning"])
        questions.append({"wordId": word_id, "word": word["word"], "choices": choices})
    quiz_id = str(ObjectId())
    quiz_cache[quiz_id] = {"user_id": str(user["_id"]), "answers": answer_key, "expires_at": now() + timedelta(minutes=30)}
    return {"quizId": quiz_id, "questions": questions}


@app.post("/api/quiz/submit")
async def submit_quiz(body: QuizSubmitBody, user: dict = Depends(current_user)):
    quiz = quiz_cache.pop(body.quizId, None)
    if not quiz or quiz["user_id"] != str(user["_id"]) or quiz["expires_at"] < now():
        raise HTTPException(400, "This quiz expired. Please start a new one.")
    correct = 0
    stored_answers = []
    for answer in body.answers:
        word = await db.vocabulary.find_one({"_id": ObjectId(answer.wordId), "user_id": user["_id"]})
        if not word:
            continue
        is_correct = quiz["answers"].get(answer.wordId) == answer.selectedIndex
        stored_answers.append({"word_id": word["_id"], "selected_index": answer.selectedIndex, "correct": is_correct})
        if is_correct:
            correct += 1
            await db.vocabulary.update_one({"_id": word["_id"]}, {"$inc": {"revision_count": 1}, "$set": {"last_revised_at": now(), "needs_revision": False}})
        else:
            await db.vocabulary.update_one({"_id": word["_id"]}, {"$set": {"needs_revision": True}})
    attempt = {"user_id": user["_id"], "answers": stored_answers, "score": correct, "total": len(body.answers), "completed_at": now()}
    await db.quiz_attempts.insert_one(attempt)
    return {"score": correct, "total": len(body.answers)}
