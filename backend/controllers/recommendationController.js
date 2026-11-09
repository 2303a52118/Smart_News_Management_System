const Article = require("../models/article");
const ReaderInteraction = require("../models/readerinteraction");
const User = require("../models/user");
const {
  buildPopularityFallback,
  requestMlRecommendations,
} = require("../services/recommendationService");

const MAX_CANDIDATE_ARTICLES = 1000;
const MAX_RECOMMENDATIONS = 50;

const toMlArticle = (article) => ({
  id: String(article._id),
  title: article.title || "",
  summary: article.summary || "",
  content: typeof article.content === "string" ? article.content.slice(0, 8000) : "",
  category: article.category || "",
  tags: Array.isArray(article.tags) ? article.tags : [],
  status: article.status,
  views: Number.isFinite(article.views) ? article.views : 0,
  likes: Number.isFinite(article.likes) ? article.likes : 0,
  published_at: article.publishedAt || null,
  image_url: article.imageUrl || "",
});

const getRecommendations = async (req, res) => {
  const requestedLimit =
    req.query.limit === undefined ? 10 : Number(req.query.limit);
  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > MAX_RECOMMENDATIONS
  ) {
    return res.status(400).json({
      message: `limit must be an integer between 1 and ${MAX_RECOMMENDATIONS}`,
    });
  }

  try {
    const [user, articles, interactions] = await Promise.all([
      User.findById(req.user._id).select("interests").lean(),
      Article.find({ status: "Published" })
        .select(
          "title summary content category tags status views likes publishedAt imageUrl"
        )
        .sort({ publishedAt: -1 })
        .limit(MAX_CANDIDATE_ARTICLES)
        .lean(),
      ReaderInteraction.find({
        user: req.user._id,
        $or: [{ isLiked: true }, { viewCount: { $gt: 0 } }],
      })
        .populate({
          path: "article",
          match: { status: "Published" },
          select:
            "title summary content category tags status views likes publishedAt imageUrl",
        })
        .lean(),
    ]);

    if (!user) {
      return res.status(404).json({ message: "Reader not found" });
    }

    const publishedArticles = articles.map(toMlArticle);
    const readingHistory = [];
    const likedArticles = [];
    const readIds = new Set();

    for (const interaction of interactions) {
      if (!interaction.article) {
        continue;
      }

      const profileArticle = toMlArticle(interaction.article);
      if (interaction.viewCount > 0) {
        readingHistory.push(profileArticle);
        readIds.add(profileArticle.id);
      }
      if (interaction.isLiked) {
        likedArticles.push(profileArticle);
        readIds.add(profileArticle.id);
      }
    }

    const profile = {
      reader_interests: Array.isArray(user.interests) ? user.interests : [],
      preferred_categories: [],
      preferred_tags: [],
      reading_history: readingHistory,
      liked_articles: likedArticles,
      articles: publishedArticles,
      limit: requestedLimit,
    };

    let result;
    try {
      result = await requestMlRecommendations(profile);
      result.fallback = false;
    } catch (error) {
      console.error("ML recommendation service unavailable:", error.message);
      result = buildPopularityFallback(
        publishedArticles,
        [...readingHistory, ...likedArticles],
        requestedLimit
      );
    }

    const publishedIds = new Set(publishedArticles.map((article) => article.id));
    result.recommendations = result.recommendations
      .filter(
        (recommendation) =>
          publishedIds.has(recommendation.article_id) &&
          !readIds.has(recommendation.article_id)
      )
      .slice(0, requestedLimit);
    result.count = result.recommendations.length;

    if (result.count === 0 && !result.message) {
      result.message = publishedArticles.length
        ? "No unread published articles are available."
        : "No published articles are available for recommendations.";
    }

    return res.json(result);
  } catch (error) {
    console.error("Recommendation generation failed:", error.message);
    return res.status(500).json({
      message: "Unable to generate recommendations",
      recommendations: [],
      count: 0,
      fallback: false,
    });
  }
};

module.exports = { getRecommendations };
