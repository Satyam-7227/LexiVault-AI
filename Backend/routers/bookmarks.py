from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from database import db
from deps import current_user
from models import BookmarkBody
from utils import now, public

router = APIRouter(prefix="/api/bookmarks", tags=["bookmarks"])


@router.get("")
async def get_bookmarks(document_id: str, user: dict = Depends(current_user)):
    query = {"user_id": user["_id"], "document_id": ObjectId(document_id)}
    return [public(item) async for item in db.bookmarks.find(query).sort("page_number", 1)]


@router.post("")
async def create_bookmark(body: BookmarkBody, user: dict = Depends(current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(body.document_id), "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Document not found.")

    # Check if bookmark already exists on this page
    existing = await db.bookmarks.find_one({
        "user_id": user["_id"],
        "document_id": ObjectId(body.document_id),
        "page_number": body.page_number,
    })
    if existing:
        # Update note if provided
        await db.bookmarks.update_one(
            {"_id": existing["_id"]},
            {"$set": {"note": body.note, "updated_at": now()}}
        )
        existing["note"] = body.note
        return public(existing)

    bookmark = {
        "user_id": user["_id"],
        "document_id": ObjectId(body.document_id),
        "page_number": body.page_number,
        "note": body.note,
        "created_at": now(),
        "updated_at": now(),
    }
    result = await db.bookmarks.insert_one(bookmark)
    bookmark["_id"] = result.inserted_id
    return public(bookmark)


@router.delete("/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, user: dict = Depends(current_user)):
    bookmark = await db.bookmarks.find_one({"_id": ObjectId(bookmark_id), "user_id": user["_id"]})
    if not bookmark:
        raise HTTPException(404, "Bookmark not found.")
    await db.bookmarks.delete_one({"_id": bookmark["_id"]})
    return {"ok": True}
