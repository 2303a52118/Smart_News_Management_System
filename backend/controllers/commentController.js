const mongoose = require("mongoose");
const Article = require("../models/article");
const Comment = require("../models/comment");

const MAX_PAGE = 10000;
const MAX_LIMIT = 100;
const MAX_COMMENT_LENGTH = 5000;
const MAX_MODERATION_REASON_LENGTH = 1000;

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

const getComments = async (req, res) => {
  try {
    const articleResult = await getPublishedArticle(req.params.id);
    if (articleResult.error) {
      return res
        .status(articleResult.status)
        .json({ message: articleResult.error });
    }

    const pagination = parsePagination(req.query);
    const filter = { article: articleResult.article._id, status: "Approved" };
    const [totalComments, comments] = await Promise.all([
      Comment.countDocuments(filter),
      Comment.find(filter)
        .populate("author", "name")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
    ]);

    return res.json({
      totalComments,
      currentPage: pagination.page,
      totalPages: Math.ceil(totalComments / pagination.limit),
      comments,
    });
  } catch (error) {
    return sendError(res, error, "list comments");
  }
};

const getModerationQueue = async (req, res) => {
  const status = req.query.status === undefined ? "Pending" : req.query.status;
  if (!["Pending", "Approved", "Rejected"].includes(status)) {
    return res.status(400).json({
      message: "status must be Pending, Approved, or Rejected",
    });
  }

  try {
    const pagination = parsePagination(req.query);
    const filter = { status };
    const [totalComments, comments] = await Promise.all([
      Comment.countDocuments(filter),
      Comment.find(filter)
        .populate("author", "name email")
        .populate("article", "title status")
        .sort({ createdAt: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
    ]);

    return res.json({
      totalComments,
      currentPage: pagination.page,
      totalPages: Math.ceil(totalComments / pagination.limit),
      comments,
    });
  } catch (error) {
    return sendError(res, error, "list moderation queue");
  }
};

const createComment = async (req, res) => {
  const { content } = req.body || {};
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.trim().length > MAX_COMMENT_LENGTH
  ) {
    return res.status(400).json({
      message: `Comment must contain 1-${MAX_COMMENT_LENGTH} characters`,
    });
  }

  try {
    const articleResult = await getPublishedArticle(req.params.id);
    if (articleResult.error) {
      return res
        .status(articleResult.status)
        .json({ message: articleResult.error });
    }

    const comment = await Comment.create({
      article: articleResult.article._id,
      author: req.user._id,
      content: content.trim(),
      status: "Pending",
    });

    await comment.populate("author", "name");
    return res.status(201).json({
      message: "Comment submitted for moderation",
      comment,
    });
  } catch (error) {
    return sendError(res, error, "create comment");
  }
};

const findComment = async (id, res) => {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid comment ID" });
    return null;
  }

  const comment = await Comment.findById(id);
  if (!comment) {
    res.status(404).json({ message: "Comment not found" });
    return null;
  }

  return comment;
};

const updateComment = async (req, res) => {
  const { content } = req.body || {};
  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.trim().length > MAX_COMMENT_LENGTH
  ) {
    return res.status(400).json({
      message: `Comment must contain 1-${MAX_COMMENT_LENGTH} characters`,
    });
  }

  try {
    const comment = await findComment(req.params.id, res);
    if (!comment) {
      return;
    }

    if (String(comment.author) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!["Pending", "Rejected"].includes(comment.status)) {
      return res.status(409).json({
        message: "Only pending or rejected comments can be edited",
      });
    }

    const updated = await Comment.findOneAndUpdate(
      {
        _id: comment._id,
        author: req.user._id,
        status: { $in: ["Pending", "Rejected"] },
      },
      {
        $set: {
          content: content.trim(),
          status: "Pending",
          moderationReason: "",
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({
        message: "The comment is no longer eligible for editing",
      });
    }

    await updated.populate("author", "name");
    return res.json({ message: "Comment updated", comment: updated });
  } catch (error) {
    return sendError(res, error, "update comment");
  }
};

const deleteComment = async (req, res) => {
  try {
    const comment = await findComment(req.params.id, res);
    if (!comment) {
      return;
    }

    const isModerator = ["Admin", "Editor"].includes(req.user.role);
    const isOwner = String(comment.author) === String(req.user._id);
    if (!isModerator && !isOwner) {
      return res.status(403).json({ message: "Access denied" });
    }

    await Comment.deleteOne(
      isModerator
        ? { _id: comment._id }
        : { _id: comment._id, author: req.user._id }
    );
    return res.json({ message: "Comment deleted" });
  } catch (error) {
    return sendError(res, error, "delete comment");
  }
};

const moderateComment = async (req, res) => {
  if (!req.user || !["Admin", "Editor"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }

  const { status, reason = "" } = req.body || {};
  if (!["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({
      message: "Moderation status must be Approved or Rejected",
    });
  }

  if (
    typeof reason !== "string" ||
    reason.trim().length > MAX_MODERATION_REASON_LENGTH ||
    (status === "Rejected" && !reason.trim())
  ) {
    return res.status(400).json({
      message: `A rejected comment requires a reason of 1-${MAX_MODERATION_REASON_LENGTH} characters`,
    });
  }

  try {
    const comment = await findComment(req.params.id, res);
    if (!comment) {
      return;
    }

    if (comment.status !== "Pending") {
      return res.status(409).json({
        message: "Only pending comments can be moderated",
      });
    }

    const updated = await Comment.findOneAndUpdate(
      { _id: comment._id, status: "Pending" },
      {
        $set: {
          status,
          moderationReason: status === "Rejected" ? reason.trim() : "",
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({
        message: "The comment has already been moderated",
      });
    }

    return res.json({ message: `Comment ${status.toLowerCase()}`, comment: updated });
  } catch (error) {
    return sendError(res, error, "moderate comment");
  }
};

module.exports = {
  getComments,
  getModerationQueue,
  createComment,
  updateComment,
  deleteComment,
  moderateComment,
};
