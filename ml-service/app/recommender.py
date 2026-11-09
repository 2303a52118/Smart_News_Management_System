from __future__ import annotations

import re
from collections.abc import Iterable

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.config import (
    DEFAULT_RECOMMENDATION_LIMIT,
    MAX_RECOMMENDATION_LIMIT,
)
from app.schemas import ArticleInput, RecommendationRequest, RecommendationResponse

WHITESPACE = re.compile(r"\s+")


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    if text in {"nan", "none", "null"}:
        return ""
    return WHITESPACE.sub(" ", text)


def article_document(article: ArticleInput) -> str:
    parts: Iterable[object] = (
        article.title,
        article.summary,
        article.content,
        article.category,
        " ".join(article.tags),
    )
    return " ".join(filter(None, (clean_text(part) for part in parts)))


def _article_by_id(articles: list[ArticleInput]) -> dict[str, ArticleInput]:
    return {article.id: article for article in articles}


def _profile_document(request: RecommendationRequest) -> str:
    parts: list[str] = [
        *request.reader_interests,
        *request.preferred_categories,
        *request.preferred_tags,
    ]
    history_by_id = _article_by_id(request.reading_history)
    liked_by_id = _article_by_id(request.liked_articles)

    for article in history_by_id.values():
        parts.append(article_document(article))
    for article in liked_by_id.values():
        parts.extend([article_document(article)] * 3)

    return clean_text(" ".join(parts))


def _popularity_score(article: ArticleInput) -> float:
    return float(article.views + 3 * article.likes)


def _reason_for(
    article: ArticleInput,
    request: RecommendationRequest,
    score: float,
) -> str:
    article_category = clean_text(article.category)
    article_tags = {clean_text(tag) for tag in article.tags}
    for category in request.preferred_categories:
        if clean_text(category) == article_category:
            return f"Matches your preferred category: {article.category}."

    for tag in [*request.preferred_tags, *request.reader_interests]:
        if clean_text(tag) in article_tags:
            return f"Matches your interest in {tag.strip()}."

    liked_terms = {
        clean_text(tag)
        for liked in request.liked_articles
        for tag in [liked.category, *liked.tags]
        if clean_text(tag)
    }
    if article_category in liked_terms or article_tags.intersection(liked_terms):
        return "Similar to topics in articles you liked."

    if score > 0:
        return "Content is relevant to your reading profile."
    return "Popular with readers."


def recommend(request: RecommendationRequest) -> RecommendationResponse:
    candidates = [
        article
        for article in request.articles
        if article.status == "Published"
        and article_document(article)
    ]
    if not candidates:
        return RecommendationResponse(
            recommendations=[],
            count=0,
            message="No published articles are available for recommendations.",
        )

    history_ids = {article.id for article in request.reading_history}
    liked_ids = {article.id for article in request.liked_articles}
    excluded_ids = history_ids | liked_ids
    candidates = [article for article in candidates if article.id not in excluded_ids]
    if not candidates:
        return RecommendationResponse(
            recommendations=[],
            count=0,
            message="No unread published articles are available.",
        )

    unique_candidates = list({article.id: article for article in candidates}.values())
    frame = pd.DataFrame(
        [
            {
                "article": article,
                "article_id": article.id,
                "document": article_document(article),
                "popularity": _popularity_score(article),
                "published_at": article.published_at,
            }
            for article in unique_candidates
        ]
    )

    profile = _profile_document(request)
    scores = np.zeros(len(frame), dtype=float)
    if profile:
        documents = [*frame["document"].tolist(), profile]
        try:
            vectorizer = TfidfVectorizer(
                strip_accents="unicode",
                ngram_range=(1, 2),
                max_features=50000,
                sublinear_tf=True,
            )
            vectors = vectorizer.fit_transform(documents)
            scores = cosine_similarity(vectors[-1], vectors[:-1]).ravel()
        except ValueError:
            scores = np.zeros(len(frame), dtype=float)

    frame["similarity"] = scores
    has_personalization = bool(profile) and bool(np.any(scores > 0))
    if has_personalization:
        frame = frame.sort_values(
            ["similarity", "popularity", "published_at", "article_id"],
            ascending=[False, False, False, True],
            na_position="last",
            kind="stable",
        )
        message = "Recommendations are personalized using TF-IDF and cosine similarity."
    else:
        frame = frame.sort_values(
            ["popularity", "published_at", "article_id"],
            ascending=[False, False, True],
            na_position="last",
            kind="stable",
        )
        message = "Showing popular published articles while a matching profile is unavailable."

    limit = min(request.limit, MAX_RECOMMENDATION_LIMIT)
    recommendations = [
        {
            "article_id": row.article.id,
            "title": row.article.title,
            "category": row.article.category,
            "summary": row.article.summary,
            "image_url": row.article.image_url,
            "similarity_score": round(float(row.similarity), 6),
            "recommendation_reason": _reason_for(
                row.article, request, float(row.similarity)
            ),
        }
        for row in frame.head(limit).itertuples()
    ]

    return RecommendationResponse(
        recommendations=recommendations,
        count=len(recommendations),
        message=message,
    )
