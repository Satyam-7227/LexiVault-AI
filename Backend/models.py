from typing import Literal
from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


# ── AI ────────────────────────────────────────────────────────────────────────
class ExplainBody(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    context: str | None = None          # surrounding sentence (optional, Phase 8)


# ── Vocabulary ────────────────────────────────────────────────────────────────
class VocabularyBody(BaseModel):
    word: str
    meaning: str
    simpleExplanation: str
    synonyms: list[str] = []
    exampleSentence: str
    difficulty: Literal["Easy", "Medium", "Hard"]
    documentId: str | None = None
    phonetic: str = ""
    partOfSpeech: str = ""
    notes: str = ""    # optional note saved at creation time


class VocabularyPatchBody(BaseModel):
    notes: str | None = None
    tags: list[str] | None = None
    is_favorite: bool | None = None
    phonetic: str | None = None
    part_of_speech: str | None = None


# ── Documents ─────────────────────────────────────────────────────────────────
class ProgressBody(BaseModel):
    current_page: int = Field(ge=1)
    total_pages: int = Field(ge=1)


class RenameBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


# ── Annotations ───────────────────────────────────────────────────────────────
class AnnotationBody(BaseModel):
    document_id: str
    vocabulary_id: str
    word: str
    page_number: int
    text_start_offset: int
    text_end_offset: int
    surrounding_text: str = ""
    highlight_color: str = "#86efac"   # green default
    note: str = ""                     # optional reader note


# ── Bookmarks ─────────────────────────────────────────────────────────────────
class BookmarkBody(BaseModel):
    document_id: str
    page_number: int = Field(ge=1)
    note: str = ""                     # optional bookmark label


# ── Reading Sessions ──────────────────────────────────────────────────────────
class ReadingSessionBody(BaseModel):
    document_id: str
    duration_seconds: int = Field(ge=0)
    pages_read: int = Field(ge=0, default=0)


# ── Quiz ──────────────────────────────────────────────────────────────────────
class QuizAnswer(BaseModel):
    wordId: str
    selectedIndex: int


class QuizSubmitBody(BaseModel):
    quizId: str
    answers: list[QuizAnswer]


# ── FSRS Review ───────────────────────────────────────────────────────────────
class ReviewBody(BaseModel):
    rating: Literal[1, 2, 3, 4]   # 1=Again 2=Hard 3=Good 4=Easy


# ── Auth (email) ──────────────────────────────────────────────────────────────
class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=72)
