from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import db
from deps import current_user
from routers import auth, documents, vocabulary, quiz, ai, annotations, analytics

app = FastAPI(title="LexiVault AI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(vocabulary.router)
app.include_router(quiz.router)
app.include_router(ai.router)
app.include_router(annotations.router)
app.include_router(analytics.router)


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.vocabulary.create_index([("user_id", 1), ("normalized_word", 1)], unique=True)
    await db.vocabulary.create_index([("user_id", 1), ("next_review_at", 1)])
    await db.vocabulary.create_index([("user_id", 1), ("document_id", 1)])
    await db.documents.create_index([("user_id", 1), ("uploaded_at", -1)])
    await db.annotations.create_index([("user_id", 1), ("document_id", 1)])


# ── Dashboard (kept in main for simplicity) ────────────────────────────────────
from datetime import timedelta
from utils import now


@app.get("/api/dashboard")
async def dashboard(user: dict = Depends(current_user)):
    uid = user["_id"]
    total = await db.vocabulary.count_documents({"user_id": uid})
    revise = await db.vocabulary.count_documents(
        {"user_id": uid, "next_review_at": {"$lte": now()}}
    )
    last_quiz = await db.quiz_attempts.find_one({"user_id": uid}, sort=[("completed_at", -1)])
    since_quiz = total
    if last_quiz:
        since_quiz = await db.vocabulary.count_documents(
            {"user_id": uid, "saved_at": {"$gt": last_quiz["completed_at"]}}
        )
    review_words = [
        item async for item in db.vocabulary.find(
            {"user_id": uid, "next_review_at": {"$lte": now()}}
        ).sort("next_review_at", 1).limit(10)
    ]
    return {
        "wordsLearned": total,
        "reviseToday": revise,
        "newWordsSinceQuiz": since_quiz,
        "lastQuizScore": last_quiz.get("score") if last_quiz else None,
        "reviewWords": [
            {
                "id": str(w["_id"]),
                "word": w["word"],
                "meaning": w["meaning"],
                "difficulty": w["difficulty"],
                "phonetic": w.get("phonetic", ""),
            }
            for w in review_words
        ],
    }


@app.get("/api/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}
