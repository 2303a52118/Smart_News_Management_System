from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_recommend_endpoint_returns_ranked_recommendations() -> None:
    response = client.post(
        "/recommend",
        json={
            "reader_interests": ["astronomy"],
            "articles": [
                {
                    "id": "space",
                    "title": "Astronomy discovery",
                    "summary": "New telescope studies stars",
                    "content": "Astronomy science",
                    "category": "Science",
                    "tags": ["space"],
                    "status": "Published",
                },
                {
                    "id": "food",
                    "title": "New restaurant menu",
                    "summary": "Fresh local food",
                    "content": "Restaurant review",
                    "category": "Food",
                    "tags": ["dining"],
                    "status": "Published",
                },
            ],
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["count"] == 2
    assert result["recommendations"][0]["article_id"] == "space"
    assert "similarity_score" in result["recommendations"][0]
    assert "recommendation_reason" in result["recommendations"][0]


def test_invalid_payload_is_rejected() -> None:
    response = client.post(
        "/recommend",
        json={"reader_interests": ["science"], "articles": [{"title": "Missing ID"}]},
    )
    assert response.status_code == 422


def test_unknown_fields_are_rejected() -> None:
    response = client.post(
        "/recommend",
        json={"articles": [], "unexpected": True},
    )
    assert response.status_code == 422


def test_invalid_status_is_not_recommended() -> None:
    response = client.post(
        "/recommend",
        json={
            "articles": [
                {
                    "id": "draft",
                    "title": "Draft story",
                    "status": "Draft",
                }
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["recommendations"] == []
