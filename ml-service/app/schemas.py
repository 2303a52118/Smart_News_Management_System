from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

TextValue = Annotated[str, Field(max_length=1000)]


class ArticleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[str, Field(min_length=1, max_length=128)]
    title: Annotated[str, Field(max_length=1000)] = ""
    summary: Annotated[str, Field(max_length=5000)] = ""
    content: Annotated[str, Field(max_length=100000)] = ""
    category: Annotated[str, Field(max_length=200)] = ""
    tags: list[Annotated[str, Field(max_length=100)]] = Field(default_factory=list)
    status: str = "Published"
    views: Annotated[int, Field(ge=0)] = 0
    likes: Annotated[int, Field(ge=0)] = 0
    published_at: datetime | None = None
    image_url: Annotated[str, Field(max_length=2048)] = ""

    @field_validator("id", "title", "summary", "content", "category", "image_url")
    @classmethod
    def strip_strings(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))


class RecommendationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reader_interests: list[TextValue] = Field(default_factory=list, max_length=30)
    preferred_categories: list[TextValue] = Field(default_factory=list, max_length=30)
    preferred_tags: list[TextValue] = Field(default_factory=list, max_length=50)
    reading_history: list[ArticleInput] = Field(default_factory=list, max_length=500)
    liked_articles: list[ArticleInput] = Field(default_factory=list, max_length=500)
    articles: list[ArticleInput] = Field(default_factory=list, max_length=5000)
    limit: Annotated[int, Field(ge=1, le=50)] = 10

    @field_validator("reader_interests", "preferred_categories", "preferred_tags")
    @classmethod
    def strip_profile_values(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(value.strip() for value in values if value.strip()))


class RecommendationItem(BaseModel):
    article_id: str
    title: str
    category: str
    summary: str
    image_url: str
    similarity_score: float
    recommendation_reason: str


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendationItem]
    count: int
    message: str
