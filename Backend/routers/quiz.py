import random
from bson import ObjectId
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from database import db
from deps import current_user
from models import QuizSubmitBody
from utils import now

router = APIRouter(prefix="/api/quiz", tags=["quiz"])

quiz_cache: dict[str, dict] = {}


@router.get("")
async def generate_quiz(document_id: str = "", user: dict = Depends(current_user)):
    query: dict = {"user_id": user["_id"]}
    if document_id:
        query["document_id"] = ObjectId(document_id)

    words = [item async for item in db.vocabulary.find(query).sort("saved_at", -1).limit(12)]
    if len(words) < 5:
        raise HTTPException(400, "Save at least five words before starting a quiz.")

    questions = []
    answer_key: dict[str, int] = {}
    for word in words[:5]:
        pool = [item for item in words if item["_id"] != word["_id"]]
        distractors = [item["meaning"] for item in pool[:3]]
        choices = [word["meaning"], *distractors]
        random.shuffle(choices)
        word_id = str(word["_id"])
        answer_key[word_id] = choices.index(word["meaning"])
        questions.append({"wordId": word_id, "word": word["word"], "choices": choices})

    quiz_id = str(ObjectId())
    quiz_cache[quiz_id] = {
        "user_id": str(user["_id"]),
        "answers": answer_key,
        "expires_at": now() + timedelta(minutes=30),
    }
    return {"quizId": quiz_id, "questions": questions}


@router.post("/submit")
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
        stored_answers.append(
            {"word_id": word["_id"], "selected_index": answer.selectedIndex, "correct": is_correct}
        )
        if is_correct:
            correct += 1
            await db.vocabulary.update_one(
                {"_id": word["_id"]},
                {"$inc": {"revision_count": 1}, "$set": {"last_revised_at": now(), "needs_revision": False}},
            )
        else:
            await db.vocabulary.update_one({"_id": word["_id"]}, {"$set": {"needs_revision": True}})

    attempt = {
        "user_id": user["_id"],
        "answers": stored_answers,
        "score": correct,
        "total": len(body.answers),
        "completed_at": now(),
    }
    await db.quiz_attempts.insert_one(attempt)
    return {"score": correct, "total": len(body.answers)}
