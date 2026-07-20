from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from database import db
from deps import current_user
from models import AnnotationBody
from utils import now, public

router = APIRouter(prefix="/api/annotations", tags=["annotations"])

DIFFICULTY_COLORS = {
    "Easy": "#86efac",    # green-300
    "Medium": "#fde68a",  # yellow-200
    "Hard": "#fca5a5",    # red-300
}


@router.get("")
async def get_annotations(document_id: str, user: dict = Depends(current_user)):
    query = {"user_id": user["_id"], "document_id": ObjectId(document_id)}
    return [public(item) async for item in db.annotations.find(query)]


@router.post("")
async def create_annotation(body: AnnotationBody, user: dict = Depends(current_user)):
    # Verify document and vocabulary belong to user
    doc = await db.documents.find_one({"_id": ObjectId(body.document_id), "user_id": user["_id"]})
    if not doc:
        raise HTTPException(404, "Document not found.")
    vocab = await db.vocabulary.find_one({"_id": ObjectId(body.vocabulary_id), "user_id": user["_id"]})
    if not vocab:
        raise HTTPException(404, "Vocabulary word not found.")

    # Determine highlight color from difficulty
    color = DIFFICULTY_COLORS.get(vocab.get("difficulty", "Medium"), body.highlight_color)

    annotation = {
        "user_id": user["_id"],
        "document_id": ObjectId(body.document_id),
        "vocabulary_id": ObjectId(body.vocabulary_id),
        "word": body.word,
        "page_number": body.page_number,
        "text_start_offset": body.text_start_offset,
        "text_end_offset": body.text_end_offset,
        "surrounding_text": body.surrounding_text,
        "highlight_color": color,
        "created_at": now(),
    }
    result = await db.annotations.insert_one(annotation)
    annotation["_id"] = result.inserted_id
    return public(annotation)


@router.delete("/{annotation_id}")
async def delete_annotation(annotation_id: str, user: dict = Depends(current_user)):
    annotation = await db.annotations.find_one({"_id": ObjectId(annotation_id), "user_id": user["_id"]})
    if not annotation:
        raise HTTPException(404, "Annotation not found.")
    await db.annotations.delete_one({"_id": annotation["_id"]})
    return {"ok": True}
