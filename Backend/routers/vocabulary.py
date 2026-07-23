import re
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from database import db
from deps import current_user
from models import VocabularyBody, VocabularyPatchBody, ReviewBody
from utils import now, public
from datetime import timedelta

router = APIRouter(prefix="/api/vocabulary", tags=["vocabulary"])


@router.post("")
async def save_vocabulary(body: VocabularyBody, user: dict = Depends(current_user)):
    normalized = body.word.strip().lower()
    document_id = ObjectId(body.documentId) if body.documentId else None
    record = {
        "user_id": user["_id"],
        "normalized_word": normalized,
        "word": body.word.strip(),
        "meaning": body.meaning,
        "simple_explanation": body.simpleExplanation,
        "synonyms": body.synonyms,
        "example_sentence": body.exampleSentence,
        "difficulty": body.difficulty,
        "phonetic": body.phonetic,
        "part_of_speech": body.partOfSpeech,
        "document_id": document_id,
        "saved_at": now(),
        "last_revised_at": now(),
        "revision_count": 0,
        "needs_revision": False,
        # Rich features (Phase 4)
        "notes": body.notes,   # saved at creation time
        "tags": [],
        "is_favorite": False,
        "source_document_id": document_id,
        "source_page": None,
        # FSRS fields
        "next_review_at": now() + timedelta(days=1),
        "stability": 0.0,
        "difficulty_score": 0.0,
        "review_history": [],
    }
    await db.vocabulary.update_one(
        {"user_id": user["_id"], "normalized_word": normalized},
        {"$set": record},
        upsert=True,
    )
    saved = await db.vocabulary.find_one({"user_id": user["_id"], "normalized_word": normalized})
    # Update document word count
    if document_id:
        count = await db.vocabulary.count_documents({"user_id": user["_id"], "document_id": document_id})
        await db.documents.update_one({"_id": document_id}, {"$set": {"word_count": count}})
    return public(saved)


@router.get("")
async def vocabulary(search: str = "", tag: str = "", favorites_only: bool = False, document_id: str = "", user: dict = Depends(current_user)):
    query: dict = {"user_id": user["_id"]}
    if search:
        query["word"] = {"$regex": re.escape(search), "$options": "i"}
    if tag:
        query["tags"] = tag
    if favorites_only:
        query["is_favorite"] = True
    if document_id:
        query["document_id"] = ObjectId(document_id)
    return [public(item) async for item in db.vocabulary.find(query).sort("saved_at", -1)]


@router.get("/review")
async def get_review_queue(user: dict = Depends(current_user)):
    """Return words due for FSRS review today."""
    words = [
        public(item) async for item in db.vocabulary.find(
            {"user_id": user["_id"], "next_review_at": {"$lte": now()}}
        ).sort("next_review_at", 1).limit(20)
    ]
    return words


@router.patch("/{word_id}")
async def patch_vocabulary(word_id: str, body: VocabularyPatchBody, user: dict = Depends(current_user)):
    word = await db.vocabulary.find_one({"_id": ObjectId(word_id), "user_id": user["_id"]})
    if not word:
        raise HTTPException(404, "Word not found.")
    updates: dict = {}
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.tags is not None:
        updates["tags"] = body.tags
    if body.is_favorite is not None:
        updates["is_favorite"] = body.is_favorite
    if body.phonetic is not None:
        updates["phonetic"] = body.phonetic
    if body.part_of_speech is not None:
        updates["part_of_speech"] = body.part_of_speech
    if updates:
        await db.vocabulary.update_one({"_id": word["_id"]}, {"$set": updates})
    updated = await db.vocabulary.find_one({"_id": word["_id"]})
    return public(updated)


@router.delete("/{word_id}")
async def delete_vocabulary(word_id: str, user: dict = Depends(current_user)):
    """Permanently delete a vocabulary word and all its annotations."""
    word = await db.vocabulary.find_one({"_id": ObjectId(word_id), "user_id": user["_id"]})
    if not word:
        raise HTTPException(404, "Word not found.")
    # Delete all annotations referencing this word
    await db.annotations.delete_many({"vocabulary_id": word["_id"], "user_id": user["_id"]})
    # Update document word count if word was tied to a document
    doc_id = word.get("document_id")
    await db.vocabulary.delete_one({"_id": word["_id"]})
    if doc_id:
        count = await db.vocabulary.count_documents({"user_id": user["_id"], "document_id": doc_id})
        await db.documents.update_one({"_id": doc_id}, {"$set": {"word_count": count}})
    return {"ok": True}


@router.post("/{word_id}/review")
async def submit_review(word_id: str, body: ReviewBody, user: dict = Depends(current_user)):
    """Process FSRS review rating and schedule next review."""
    word = await db.vocabulary.find_one({"_id": ObjectId(word_id), "user_id": user["_id"]})
    if not word:
        raise HTTPException(404, "Word not found.")

    # Simple SM-2 inspired intervals based on rating
    # 1=Again, 2=Hard, 3=Good, 4=Easy
    current_stability = word.get("stability", 0.0)
    rating = body.rating

    interval_map = {1: 1, 2: 3, 3: 7, 4: 14}
    # Increase stability for correct answers (rating >= 3)
    if rating >= 3:
        new_stability = min(current_stability + rating * 2, 100.0)
        interval = interval_map[rating] + int(current_stability / 5)
        needs_revision = False
    else:
        new_stability = max(current_stability - 5, 0.0)
        interval = interval_map[rating]
        needs_revision = rating == 1

    next_review = now() + timedelta(days=interval)
    review_entry = {"rating": rating, "reviewed_at": now(), "interval_days": interval}

    await db.vocabulary.update_one(
        {"_id": word["_id"]},
        {
            "$set": {
                "next_review_at": next_review,
                "stability": new_stability,
                "needs_revision": needs_revision,
                "last_revised_at": now(),
            },
            "$inc": {"revision_count": 1},
            "$push": {"review_history": review_entry},
        },
    )
    return {"ok": True, "next_review_at": next_review.isoformat(), "interval_days": interval}
