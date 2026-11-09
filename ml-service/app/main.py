from fastapi import FastAPI

from app.config import SERVICE_NAME
from app.recommender import recommend
from app.schemas import RecommendationRequest, RecommendationResponse

app = FastAPI(
    title=SERVICE_NAME,
    description="Content-based news recommendations using TF-IDF and cosine similarity.",
    version="1.0.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": SERVICE_NAME}


@app.post("/recommend", response_model=RecommendationResponse)
def get_recommendations(
    request: RecommendationRequest,
) -> RecommendationResponse:
    return recommend(request)
