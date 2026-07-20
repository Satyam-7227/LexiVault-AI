import re
import shutil
import base64
from pathlib import Path
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from database import db
from deps import current_user
from models import ProgressBody, RenameBody
from utils import now, public
from config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])
UPLOAD_PATH = Path(settings.upload_dir)
UPLOAD_PATH.mkdir(parents=True, exist_ok=True)
THUMB_PATH = UPLOAD_PATH / "thumbnails"
THUMB_PATH.mkdir(parents=True, exist_ok=True)


@router.post("")
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
    document = {
        "user_id": user["_id"],
        "original_name": file.filename,
        "custom_name": None,
        "file_path": str(target.resolve()),
        "uploaded_at": now(),
        "last_opened_at": None,
        "last_opened_page": 1,
        "total_pages": 0,
        "progress_percent": 0.0,
        "thumbnail_url": None,
        "word_count": 0,
    }
    result = await db.documents.insert_one(document)
    document["_id"] = result.inserted_id
    return public(document)


@router.get("")
async def list_documents(user: dict = Depends(current_user)):
    docs = [public(item) async for item in db.documents.find({"user_id": user["_id"]}).sort("uploaded_at", -1)]
    # Attach word count for each document
    for doc in docs:
        doc["word_count"] = await db.vocabulary.count_documents({"user_id": user["_id"], "document_id": ObjectId(doc["id"])})
    return docs


@router.get("/{document_id}")
async def get_document(document_id: str, user: dict = Depends(current_user)):
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document:
        raise HTTPException(404, "Document not found.")
    # Update last_opened_at
    await db.documents.update_one({"_id": document["_id"]}, {"$set": {"last_opened_at": now()}})
    document["last_opened_at"] = now()
    result = public(document)
    result["word_count"] = await db.vocabulary.count_documents({"user_id": user["_id"], "document_id": document["_id"]})
    return result


@router.get("/{document_id}/file")
async def document_file(document_id: str, user: dict = Depends(current_user)):
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document or not Path(document["file_path"]).exists():
        raise HTTPException(404, "Document not found.")
    return FileResponse(document["file_path"], media_type="application/pdf", filename=document["original_name"])


@router.patch("/{document_id}/progress")
async def update_progress(document_id: str, body: ProgressBody, user: dict = Depends(current_user)):
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document:
        raise HTTPException(404, "Document not found.")
    progress_percent = round((body.current_page / body.total_pages) * 100, 1) if body.total_pages > 0 else 0.0
    await db.documents.update_one(
        {"_id": document["_id"]},
        {"$set": {
            "last_opened_page": body.current_page,
            "total_pages": body.total_pages,
            "progress_percent": progress_percent,
            "last_opened_at": now(),
        }},
    )
    return {"ok": True, "current_page": body.current_page, "progress_percent": progress_percent}


@router.patch("/{document_id}/rename")
async def rename_document(document_id: str, body: RenameBody, user: dict = Depends(current_user)):
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document:
        raise HTTPException(404, "Document not found.")
    await db.documents.update_one({"_id": document["_id"]}, {"$set": {"custom_name": body.name.strip()}})
    return {"ok": True}


@router.post("/{document_id}/thumbnail")
async def save_thumbnail(document_id: str, payload: dict, user: dict = Depends(current_user)):
    """Receive base64 thumbnail from frontend PDF.js canvas render and save as file."""
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document:
        raise HTTPException(404, "Document not found.")
    data_url: str = payload.get("thumbnail", "")
    if not data_url.startswith("data:image/"):
        raise HTTPException(400, "Invalid thumbnail data.")
    header, encoded = data_url.split(",", 1)
    image_bytes = base64.b64decode(encoded)
    thumb_path = THUMB_PATH / f"{document_id}.png"
    thumb_path.write_bytes(image_bytes)
    thumb_url = f"/api/documents/{document_id}/thumbnail"
    await db.documents.update_one({"_id": document["_id"]}, {"$set": {"thumbnail_url": thumb_url}})
    return {"ok": True, "thumbnail_url": thumb_url}


@router.get("/{document_id}/thumbnail")
async def get_thumbnail(document_id: str, user: dict = Depends(current_user)):
    thumb_path = THUMB_PATH / f"{document_id}.png"
    if not thumb_path.exists():
        raise HTTPException(404, "Thumbnail not found.")
    return FileResponse(str(thumb_path), media_type="image/png")


@router.delete("/{document_id}")
async def delete_document(document_id: str, user: dict = Depends(current_user)):
    document = await db.documents.find_one({"_id": ObjectId(document_id), "user_id": user["_id"]})
    if not document:
        raise HTTPException(404, "Document not found.")
    # Delete file from disk
    file_path = Path(document["file_path"])
    file_path.unlink(missing_ok=True)
    # Delete thumbnail
    thumb_path = THUMB_PATH / f"{document_id}.png"
    thumb_path.unlink(missing_ok=True)
    # Delete all annotations for this document
    await db.annotations.delete_many({"document_id": ObjectId(document_id)})
    # Delete the document record
    await db.documents.delete_one({"_id": document["_id"]})
    return {"ok": True}
