from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from database import db
from deps import current_user
from models import ReadingSessionBody
from utils import now, public

router = APIRouter(prefix="/api/reading-sessions", tags=["reading-sessions"])


@router.post("")
async def log_reading_session(body: ReadingSessionBody, user: dict = Depends(current_user)):
    """Log a reading session when the user closes the Reader or navigates away."""
    if body.duration_seconds < 5:
        # Ignore very short sessions (likely accidental)
        return {"ok": True, "ignored": True}

    doc = await db.documents.find_one({"_id": ObjectId(body.document_id), "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Document not found.")

    session = {
        "user_id": user["_id"],
        "document_id": ObjectId(body.document_id),
        "duration_seconds": body.duration_seconds,
        "pages_read": body.pages_read,
        "started_at": now(),
    }
    await db.reading_sessions.insert_one(session)
    return {"ok": True}


@router.get("/stats")
async def reading_stats(user: dict = Depends(current_user)):
    """Return per-document total reading time and global stats."""
    pipeline = [
        {"$match": {"user_id": user["_id"]}},
        {
            "$group": {
                "_id": "$document_id",
                "total_seconds": {"$sum": "$duration_seconds"},
                "session_count": {"$sum": 1},
            }
        },
    ]
    results = await db.reading_sessions.aggregate(pipeline).to_list(100)

    stats = {}
    for r in results:
        doc_id = str(r["_id"])
        stats[doc_id] = {
            "total_seconds": r["total_seconds"],
            "session_count": r["session_count"],
        }
    return stats


@router.get("/today")
async def today_reading(user: dict = Depends(current_user)):
    """Return total seconds read today (for daily goal tracking)."""
    from datetime import datetime, timezone
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"user_id": user["_id"], "started_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total_seconds": {"$sum": "$duration_seconds"}}},
    ]
    result = await db.reading_sessions.aggregate(pipeline).to_list(1)
    total = result[0]["total_seconds"] if result else 0
    return {"today_seconds": total, "today_minutes": round(total / 60, 1)}
