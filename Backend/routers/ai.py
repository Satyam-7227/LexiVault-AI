import json
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from database import db
from deps import current_user
from models import ExplainBody
from utils import now
from config import settings

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/explain")
async def explain(body: ExplainBody, user: dict = Depends(current_user)):
    word = re.sub(r"[^A-Za-z'-]", "", body.word).strip()
    if not word:
        raise HTTPException(400, "Enter a valid English word.")

    # Check if already saved — return cached if so
    existing = await db.vocabulary.find_one({"user_id": user["_id"], "normalized_word": word.lower()})
    if existing:
        return {
            "word": existing["word"],
            "meaning": existing["meaning"],
            "simpleExplanation": existing["simple_explanation"],
            "synonyms": existing["synonyms"],
            "exampleSentence": existing["example_sentence"],
            "difficulty": existing["difficulty"],
            "phonetic": existing.get("phonetic", ""),
            "partOfSpeech": existing.get("part_of_speech", ""),
            "cached": True,
        }

    # Build prompt — include sentence context if provided
    context_hint = ""
    if body.context:
        context_hint = f' In this sentence: "{body.context}"'

    prompt = (
        f'Explain the English word "{word}"{context_hint} for a student. '
        f'Return ONLY valid JSON with exactly these keys: word, meaning, simpleExplanation, synonyms, '
        f'exampleSentence, difficulty, phonetic, partOfSpeech. '
        f'difficulty must be Easy, Medium, or Hard. '
        f'synonyms must be an array of 2 to 4 strings. '
        f'phonetic should be the IPA pronunciation string (e.g. /ɪnˈteɡrɪti/). '
        f'partOfSpeech should be one of: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection. '
        f'Keep every field concise and in English.'
    )

    try:
        async with httpx.AsyncClient(timeout=60) as http:
            response = await http.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_model, "prompt": prompt, "stream": False, "format": "json"},
            )
            response.raise_for_status()
        data = json.loads(response.json()["response"])
        required = {"word", "meaning", "simpleExplanation", "synonyms", "exampleSentence", "difficulty"}
        if not required.issubset(data) or data["difficulty"] not in {"Easy", "Medium", "Hard"}:
            raise ValueError("Unexpected AI response")
        # Ensure optional keys exist
        data.setdefault("phonetic", "")
        data.setdefault("partOfSpeech", "")
        data["cached"] = False
        return data
    except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValueError):
        raise HTTPException(
            503,
            "LexiVault AI could not reach Ollama. Ensure Ollama is running and the model is installed, then try again.",
        )
