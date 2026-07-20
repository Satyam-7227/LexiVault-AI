from bson import ObjectId
from datetime import timedelta
from fastapi import APIRouter, Depends
from database import db
from deps import current_user
from utils import now

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(user: dict = Depends(current_user)):
    uid = user["_id"]
    total_words = await db.vocabulary.count_documents({"user_id": uid})
    revise_today = await db.vocabulary.count_documents({"user_id": uid, "next_review_at": {"$lte": now()}})
    last_quiz = await db.quiz_attempts.find_one({"user_id": uid}, sort=[("completed_at", -1)])

    # Words this week
    week_ago = now() - timedelta(days=7)
    words_this_week = await db.vocabulary.count_documents({"user_id": uid, "saved_at": {"$gte": week_ago}})

    # Words this month
    month_ago = now() - timedelta(days=30)
    words_this_month = await db.vocabulary.count_documents({"user_id": uid, "saved_at": {"$gte": month_ago}})

    # Streak: count consecutive days with at least one word saved
    streak = await _calculate_streak(uid)

    # Quiz accuracy
    pipeline = [
        {"$match": {"user_id": uid}},
        {"$group": {"_id": None, "total_score": {"$sum": "$score"}, "total_questions": {"$sum": "$total"}}},
    ]
    quiz_agg = await db.quiz_attempts.aggregate(pipeline).to_list(1)
    quiz_accuracy = 0.0
    if quiz_agg and quiz_agg[0]["total_questions"] > 0:
        quiz_accuracy = round(quiz_agg[0]["total_score"] / quiz_agg[0]["total_questions"] * 100, 1)

    return {
        "total_words": total_words,
        "revise_today": revise_today,
        "words_this_week": words_this_week,
        "words_this_month": words_this_month,
        "streak_days": streak,
        "quiz_accuracy": quiz_accuracy,
        "last_quiz_score": last_quiz.get("score") if last_quiz else None,
        "last_quiz_total": last_quiz.get("total") if last_quiz else None,
    }


@router.get("/heatmap")
async def heatmap(user: dict = Depends(current_user)):
    """Return daily word-save counts for the last 365 days (GitHub-style heatmap)."""
    pipeline = [
        {"$match": {"user_id": user["_id"], "saved_at": {"$gte": now() - timedelta(days=365)}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$saved_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    results = await db.vocabulary.aggregate(pipeline).to_list(400)
    return [{"date": r["_id"], "count": r["count"]} for r in results]


@router.get("/difficulty")
async def difficulty_breakdown(user: dict = Depends(current_user)):
    pipeline = [
        {"$match": {"user_id": user["_id"]}},
        {"$group": {"_id": "$difficulty", "count": {"$sum": 1}}},
    ]
    results = await db.vocabulary.aggregate(pipeline).to_list(5)
    return {r["_id"]: r["count"] for r in results}


@router.get("/documents")
async def per_document_stats(user: dict = Depends(current_user)):
    pipeline = [
        {"$match": {"user_id": user["_id"], "document_id": {"$ne": None}}},
        {"$group": {"_id": "$document_id", "word_count": {"$sum": 1}}},
        {"$sort": {"word_count": -1}},
        {"$limit": 10},
    ]
    results = await db.vocabulary.aggregate(pipeline).to_list(10)
    enriched = []
    for r in results:
        doc = await db.documents.find_one({"_id": r["_id"]})
        if doc:
            enriched.append({
                "document_id": str(r["_id"]),
                "document_name": doc.get("custom_name") or doc.get("original_name"),
                "word_count": r["word_count"],
                "progress_percent": doc.get("progress_percent", 0),
            })
    return enriched


@router.get("/weakest")
async def weakest_words(user: dict = Depends(current_user)):
    """Words that have needs_revision=True or lowest stability."""
    words = [
        item async for item in db.vocabulary.find(
            {"user_id": user["_id"], "needs_revision": True}
        ).sort("stability", 1).limit(10)
    ]
    return [
        {
            "id": str(w["_id"]),
            "word": w["word"],
            "difficulty": w["difficulty"],
            "revision_count": w.get("revision_count", 0),
            "needs_revision": w.get("needs_revision", False),
        }
        for w in words
    ]


@router.get("/quiz-trend")
async def quiz_trend(user: dict = Depends(current_user)):
    """Return last 10 quiz attempts for accuracy trend chart."""
    attempts = [
        item async for item in db.quiz_attempts.find(
            {"user_id": user["_id"]}
        ).sort("completed_at", -1).limit(10)
    ]
    return [
        {
            "date": a["completed_at"].isoformat(),
            "score": a["score"],
            "total": a["total"],
            "accuracy": round(a["score"] / a["total"] * 100, 1) if a["total"] else 0,
        }
        for a in reversed(attempts)
    ]


async def _calculate_streak(user_id: ObjectId) -> int:
    """Count consecutive days (going back from today) on which the user saved at least one word."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$saved_at"}}}},
        {"$sort": {"_id": -1}},
        {"$limit": 365},
    ]
    days = {r["_id"] async for r in db.vocabulary.aggregate(pipeline)}
    streak = 0
    check = now().date()
    while str(check) in days:
        streak += 1
        check = check - timedelta(days=1)
    return streak
