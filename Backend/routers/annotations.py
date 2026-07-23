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
    annotations = [public(item) async for item in db.annotations.find(query)]

    # Enrich each annotation with current vocab difficulty/color
    for ann in annotations:
        vocab_id = ann.get("vocabulary_id")
        if vocab_id:
            try:
                vocab = await db.vocabulary.find_one({"_id": ObjectId(vocab_id), "user_id": user["_id"]})
                if vocab:
                    ann["difficulty"] = vocab.get("difficulty", "Medium")
                    ann["highlight_color"] = DIFFICULTY_COLORS.get(vocab.get("difficulty", "Medium"), ann["highlight_color"])
                    ann["meaning"] = vocab.get("meaning", "")
                    ann["phonetic"] = vocab.get("phonetic", "")
                    ann["part_of_speech"] = vocab.get("part_of_speech", "")
                    ann["example_sentence"] = vocab.get("example_sentence", "")
            except Exception:
                pass
    return annotations


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

    # Check if annotation already exists for this word on this document (upsert)
    existing = await db.annotations.find_one({
        "user_id": user["_id"],
        "document_id": ObjectId(body.document_id),
        "vocabulary_id": ObjectId(body.vocabulary_id),
    })
    if existing:
        await db.annotations.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "page_number": body.page_number,
                "text_start_offset": body.text_start_offset,
                "text_end_offset": body.text_end_offset,
                "surrounding_text": body.surrounding_text,
                "highlight_color": color,
                "note": body.note,
            }}
        )
        existing["highlight_color"] = color
        return public(existing)

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
        "note": body.note,
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
