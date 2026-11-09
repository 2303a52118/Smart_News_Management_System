from app.recommender import article_document, recommend
from app.schemas import ArticleInput, RecommendationRequest


def article(
    article_id: str,
    title: str,
    *,
    summary: str = "",
    category: str = "",
    tags: list[str] | None = None,
    views: int = 0,
    likes: int = 0,
    status: str = "Published",
) -> ArticleInput:
    return ArticleInput(
        id=article_id,
        title=title,
        summary=summary,
        content=summary,
        category=category,
        tags=tags or [],
        views=views,
        likes=likes,
        status=status,
    )


def test_article_text_combines_fields_and_normalizes_whitespace() -> None:
    value = article(
        "1",
        "  Solar   Energy ",
        summary=" Clean power ",
        category="Science",
        tags=["Climate"],
    )
    document = article_document(value)
    assert document == "solar energy clean power clean power science climate"


def test_reader_interests_rank_relevant_articles() -> None:
    request = RecommendationRequest(
        reader_interests=["space exploration"],
        articles=[
            article("1", "Space exploration", summary="Mars mission science"),
            article("2", "Cooking recipes", summary="Fresh pasta and herbs"),
        ],
    )
    response = recommend(request)
    assert response.recommendations[0].article_id == "1"
    assert response.recommendations[0].similarity_score > 0


def test_cosine_similarity_scores_relevant_articles_above_unrelated_content() -> None:
    response = recommend(
        RecommendationRequest(
            reader_interests=["ocean conservation"],
            articles=[
                article("related", "Ocean conservation project", summary="Marine biology"),
                article("unrelated", "City football final", summary="Local sports match"),
            ],
        )
    )
    scores = {
        item.article_id: item.similarity_score for item in response.recommendations
    }
    assert 0 < scores["related"] <= 1
    assert scores["related"] > scores["unrelated"]


def test_different_interests_change_ranking() -> None:
    articles = [
        article("1", "Space telescope astronomy", summary="Distant galaxies"),
        article("2", "Local football league", summary="Regional sports match"),
    ]
    space = recommend(
        RecommendationRequest(reader_interests=["astronomy"], articles=articles)
    )
    sports = recommend(
        RecommendationRequest(reader_interests=["football"], articles=articles)
    )
    assert space.recommendations[0].article_id == "1"
    assert sports.recommendations[0].article_id == "2"


def test_reading_history_and_liked_articles_personalize_profile() -> None:
    related = article("related", "Ocean conservation project", summary="Marine biology")
    unrelated = article("unrelated", "Classical music festival", summary="Orchestra")
    liked = article("liked", "Marine biology research", summary="Ocean ecosystems")
    response = recommend(
        RecommendationRequest(
            reading_history=[article("read", "Ocean science")],
            liked_articles=[liked],
            articles=[related, unrelated, liked],
        )
    )
    ids = [item.article_id for item in response.recommendations]
    assert "read" not in ids
    assert "liked" not in ids
    assert ids[0] == "related"


def test_previously_read_articles_are_excluded() -> None:
    read = article("read", "Climate report")
    candidate = article("candidate", "Climate policy report")
    response = recommend(
        RecommendationRequest(
            reader_interests=["climate"],
            reading_history=[read],
            articles=[read, candidate],
        )
    )
    assert [item.article_id for item in response.recommendations] == ["candidate"]


def test_new_reader_uses_popularity_fallback() -> None:
    response = recommend(
        RecommendationRequest(
            articles=[
                article("low", "City gardens", views=5),
                article("popular", "Local community news", views=100, likes=10),
            ]
        )
    )
    assert response.recommendations[0].article_id == "popular"
    assert response.recommendations[0].similarity_score == 0
    assert "popular" in response.recommendations[0].recommendation_reason.lower()
    assert "popular" in response.message.lower()


def test_only_published_articles_are_recommended() -> None:
    response = recommend(
        RecommendationRequest(
            reader_interests=["science"],
            articles=[
                article("published", "Science discovery"),
                article("draft", "Science draft", status="Draft"),
            ],
        )
    )
    assert [item.article_id for item in response.recommendations] == ["published"]


def test_empty_datasets_return_clear_empty_response() -> None:
    response = recommend(RecommendationRequest(articles=[]))
    assert response.recommendations == []
    assert response.count == 0
    assert response.message


def test_duplicate_candidates_produce_unique_recommendations() -> None:
    duplicate = article("same", "Wildlife conservation")
    response = recommend(
        RecommendationRequest(reader_interests=["wildlife"], articles=[duplicate, duplicate])
    )
    ids = [item.article_id for item in response.recommendations]
    assert len(ids) == len(set(ids)) == 1
