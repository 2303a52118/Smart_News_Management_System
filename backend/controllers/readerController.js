const mongoose = require("mongoose");
const Article = require("../models/article");
const ReaderInteraction = require("../models/readerinteraction");
const User = require("../models/user");

const MAX_PAGE = 10000;
const MAX_LIMIT = 100;
const MAX_INTERESTS = 30;
const READING_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parsePagination = (query = {}) => {
  const parse = (value, name, fallback, maximum) => {
    if (value === undefined) {
      return fallback;
    }

    if (
      typeof value !== "string" ||
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 1 ||
      Number(value) > maximum
    ) {
      const error = new Error(
        `${name} must be an integer between 1 and ${maximum}`
      );
      error.statusCode = 400;
      throw error;
    }

    return Number(value);
  };

  const page = parse(query.page, "page", 1, MAX_PAGE);
  const limit = parse(query.limit, "limit", 10, MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

const sendError = (res, error, operation) => {
  if (error.statusCode === 400) {
    return res.status(400).json({ message: error.message });
  }

  console.error(`${operation} failed:`, error.message);
  return res.status(500).json({ message: `Unable to ${operation}` });
};

const getPublishedArticle = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return { error: "Invalid article ID", status: 400 };
  }

  const article = await Article.findOne({ _id: id, status: "Published" });
  return article ? { article } : { error: "Article not found", status: 404 };
};

const getArticleInteraction = async (req, res) => {
  try {
    const articleId = req.params.id ?? req.query.articleId;
    const result = await getPublishedArticle(articleId);
    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    const interaction = await ReaderInteraction.findOne({
      user: req.user._id,
      article: result.article._id,
    })
      .select("isLiked isBookmarked")
      .lean();

    return res.json({
      liked: Boolean(interaction?.isLiked),
      bookmarked: Boolean(interaction?.isBookmarked),
    });
  } catch (error) {
    return sendError(res, error, "get article interaction");
  }
};

const ensureInteraction = async (userId, articleId) => {
  try {
    return await ReaderInteraction.findOneAndUpdate(
      { user: userId, article: articleId },
      { $setOnInsert: { user: userId, article: articleId } },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    return ReaderInteraction.findOne({ user: userId, article: articleId });
  }
};

const likeArticle = async (req, res) => {
  try {
    const result = await getPublishedArticle(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    await ensureInteraction(req.user._id, result.article._id);
    const update = await ReaderInteraction.updateOne(
      { user: req.user._id, article: result.article._id, isLiked: false },
      { $set: { isLiked: true } }
    );

    if (update.modifiedCount > 0) {
      await Article.updateOne(
        { _id: result.article._id, status: "Published" },
        { $inc: { likes: 1 } }
      );
    }

    return res.json({ liked: true });
  } catch (error) {
    return sendError(res, error, "like article");
  }
};

const unlikeArticle = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid article ID" });
    }

    const update = await ReaderInteraction.updateOne(
      { user: req.user._id, article: req.params.id, isLiked: true },
      { $set: { isLiked: false } }
    );

    if (update.modifiedCount > 0) {
      await Article.updateOne(
        { _id: req.params.id, likes: { $gt: 0 } },
        { $inc: { likes: -1 } }
      );
    }

    return res.json({ liked: false });
  } catch (error) {
    return sendError(res, error, "unlike article");
  }
};

const bookmarkArticle = async (req, res) => {
  try {
    const result = await getPublishedArticle(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    await ensureInteraction(req.user._id, result.article._id);
    await ReaderInteraction.updateOne(
      { user: req.user._id, article: result.article._id },
      { $set: { isBookmarked: true } }
    );

    return res.json({ bookmarked: true });
  } catch (error) {
    return sendError(res, error, "bookmark article");
  }
};

const unbookmarkArticle = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid article ID" });
    }

    await ReaderInteraction.updateOne(
      { user: req.user._id, article: req.params.id },
      { $set: { isBookmarked: false } }
    );

    return res.json({ bookmarked: false });
  } catch (error) {
    return sendError(res, error, "remove bookmark");
  }
};

const recordArticleView = async (req, res) => {
  const sessionId = req.get
    ? req.get("X-Reading-Session-Id")
    : req.headers?.["x-reading-session-id"];
  if (
    typeof sessionId !== "string" ||
    !READING_SESSION_ID_PATTERN.test(sessionId)
  ) {
    return res.status(400).json({
      message: "A valid X-Reading-Session-Id UUID is required",
    });
  }

  try {
    const result = await getPublishedArticle(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ message: result.error });
    }

    await ensureInteraction(req.user._id, result.article._id);
    const now = new Date();
    const interaction = await ReaderInteraction.findOneAndUpdate(
      {
        user: req.user._id,
        article: result.article._id,
        lastViewSessionId: { $ne: sessionId },
      },
      {
        $set: {
          lastViewedAt: now,
          readAt: now,
          lastViewSessionId: sessionId,
        },
        $inc: { viewCount: 1 },
      },
      { returnDocument: "after" }
    );

    if (!interaction) {
      const [currentInteraction, currentArticle] = await Promise.all([
        ReaderInteraction.findOne({
          user: req.user._id,
          article: result.article._id,
        }),
        Article.findById(result.article._id).select("views"),
      ]);

      if (!currentInteraction || !currentArticle) {
        return res.status(404).json({ message: "Article not found" });
      }

      return res.json({
        views: currentArticle.views,
        readerViewCount: currentInteraction.viewCount,
        counted: false,
      });
    }

    const articleUpdate = await Article.findOneAndUpdate(
      { _id: result.article._id, status: "Published" },
      { $inc: { views: 1 } },
      { returnDocument: "after" }
    );

    if (!articleUpdate) {
      return res.status(404).json({ message: "Article not found" });
    }

    return res.json({
      views: articleUpdate.views,
      readerViewCount: interaction.viewCount,
      counted: true,
    });
  } catch (error) {
    return sendError(res, error, "record article view");
  }
};

const getReaderInteractions = async (req, res, type) => {
  let pagination;
  try {
    pagination = parsePagination(req.query);
  } catch (error) {
    return sendError(res, error, "list reader articles");
  }

  try {
    const publishedIds = await Article.find({ status: "Published" })
      .select("_id")
      .lean();
    const articleIds = publishedIds.map((article) => article._id);
    const filter = { user: req.user._id, article: { $in: articleIds } };

    if (type === "bookmarks") {
      filter.isBookmarked = true;
    } else {
      filter.viewCount = { $gt: 0 };
    }

    const sort =
      type === "bookmarks" ? { updatedAt: -1 } : { lastViewedAt: -1 };
    const [totalArticles, interactions] = await Promise.all([
      ReaderInteraction.countDocuments(filter),
      ReaderInteraction.find(filter)
        .sort(sort)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .populate({
          path: "article",
          select: "title summary category tags imageUrl publishedAt author",
          populate: { path: "author", select: "name" },
        }),
    ]);
    const articles = interactions
      .filter((interaction) => interaction.article)
      .map((interaction) => ({
        ...interaction.article.toObject(),
        readerViewCount: interaction.viewCount,
        lastViewedAt: interaction.lastViewedAt,
        isBookmarked: interaction.isBookmarked,
      }));

    return res.json({
      totalArticles,
      currentPage: pagination.page,
      totalPages: Math.ceil(totalArticles / pagination.limit),
      articles,
    });
  } catch (error) {
    return sendError(res, error, `list reader ${type}`);
  }
};

const getBookmarks = (req, res) => getReaderInteractions(req, res, "bookmarks");
const getReadingHistory = (req, res) =>
  getReaderInteractions(req, res, "history");

const getInterests = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("interests");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ interests: user.interests });
  } catch (error) {
    return sendError(res, error, "get reader interests");
  }
};

const updateInterests = async (req, res) => {
  const { interests } = req.body || {};
  if (
    !Array.isArray(interests) ||
    interests.length > MAX_INTERESTS ||
    interests.some(
      (interest) =>
        typeof interest !== "string" ||
        !interest.trim() ||
        interest.trim().length > 60
    )
  ) {
    return res.status(400).json({
      message: `interests must be an array of up to ${MAX_INTERESTS} non-empty strings of at most 60 characters`,
    });
  }

  try {
    const normalized = [
      ...new Set(interests.map((interest) => interest.trim())),
    ];
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { interests: normalized } },
      { returnDocument: "after", runValidators: true }
    ).select("interests");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ interests: user.interests });
  } catch (error) {
    return sendError(res, error, "update reader interests");
  }
};

module.exports = {
  likeArticle,
  unlikeArticle,
  bookmarkArticle,
  unbookmarkArticle,
  recordArticleView,
  getArticleInteraction,
  getBookmarks,
  getReadingHistory,
  getInterests,
  updateInterests,
};
