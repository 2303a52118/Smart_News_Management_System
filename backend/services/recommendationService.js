const DEFAULT_ML_SERVICE_URL = "http://127.0.0.1:8000";
const ML_TIMEOUT_MS = 5000;

const requestMlRecommendations = async (profile) => {
  const serviceUrl = (
    process.env.ML_SERVICE_URL || DEFAULT_ML_SERVICE_URL
  ).replace(/\/+$/, "");
  const response = await fetch(`${serviceUrl}/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`ML service returned HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!Array.isArray(result.recommendations)) {
    throw new Error("ML service response did not contain recommendations");
  }

  return result;
};

const buildPopularityFallback = (articles, readingHistory, limit = 10) => {
  const readIds = new Set(readingHistory.map((article) => article.id));
  const recommendations = articles
    .filter((article) => article.status === "Published" && !readIds.has(article.id))
    .sort((left, right) => {
      const leftPopularity = left.views + 3 * left.likes;
      const rightPopularity = right.views + 3 * right.likes;
      return (
        rightPopularity - leftPopularity ||
        new Date(right.published_at || 0) - new Date(left.published_at || 0) ||
        left.id.localeCompare(right.id)
      );
    })
    .slice(0, limit)
    .map((article) => ({
      article_id: article.id,
      title: article.title,
      category: article.category,
      summary: article.summary,
      image_url: article.image_url,
      similarity_score: 0,
      recommendation_reason: "Popular published article (ML service unavailable).",
    }));

  return {
    recommendations,
    count: recommendations.length,
    fallback: true,
    message: recommendations.length
      ? "Recommendation service is unavailable; showing popular unread articles."
      : "Recommendation service is unavailable and no unread published articles are available.",
  };
};

module.exports = {
  requestMlRecommendations,
  buildPopularityFallback,
};
