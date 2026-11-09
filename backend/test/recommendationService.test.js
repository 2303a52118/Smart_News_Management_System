const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPopularityFallback,
} = require("../services/recommendationService");

const article = (id, views, likes, status = "Published") => ({
  id,
  title: `Article ${id}`,
  category: "Science",
  summary: "News summary",
  image_url: "",
  views,
  likes,
  status,
  published_at: "2026-01-01T00:00:00.000Z",
});

test("popularity fallback excludes read and unpublished articles", () => {
  const result = buildPopularityFallback(
    [
      article("read", 100, 100),
      article("popular", 50, 20),
      article("draft", 1000, 1000, "Draft"),
      article("other", 10, 0),
    ],
    [{ id: "read" }],
    10
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.article_id),
    ["popular", "other"]
  );
  assert.equal(result.fallback, true);
});
