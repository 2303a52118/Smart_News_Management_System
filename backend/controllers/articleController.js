const mongoose = require("mongoose");
const Article = require("../models/article");

const articleStatuses = ["Draft", "Pending", "Published", "Rejected"];
const MAX_PAGE = 10000;
const MAX_LIMIT = 100;
const MAX_TAGS = 20;
const MAX_SEARCH_LENGTH = 200;
const MAX_REJECTION_REASON_LENGTH = 1000;

class RequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveInteger = (value, name, defaultValue, maximum) => {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < 1 ||
    Number(value) > maximum
  ) {
    throw new RequestValidationError(
      `${name} must be an integer between 1 and ${maximum}`
    );
  }

  return Number(value);
};

const parseTags = (value) => {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  const tags = values.flatMap((item) =>
    typeof item === "string" ? item.split(",") : [item]
  );

  if (
    tags.length > MAX_TAGS ||
    tags.some(
      (tag) =>
        typeof tag !== "string" ||
        !tag.trim() ||
        tag.trim().length > 50
    )
  ) {
    throw new RequestValidationError(
      `tags must contain at most ${MAX_TAGS} non-empty values of 50 characters or fewer`
    );
  }

  return [...new Set(tags.map((tag) => tag.trim()))];
};

const parseListOptions = (query = {}, { staff = false } = {}) => {
  const page = parsePositiveInteger(query.page, "page", 1, MAX_PAGE);
  const limit = parsePositiveInteger(query.limit, "limit", 10, MAX_LIMIT);
  const filter = {};

  if (!staff && query.status !== undefined) {
    throw new RequestValidationError(
      "Status filtering is only available to Admins and Editors"
    );
  }

  if (staff && query.status !== undefined) {
    if (
      typeof query.status !== "string" ||
      !articleStatuses.includes(query.status)
    ) {
      throw new RequestValidationError("Invalid article status");
    }

    filter.status = query.status;
  } else if (!staff) {
    filter.status = "Published";
  }

  if (query.q !== undefined) {
    if (
      typeof query.q !== "string" ||
      query.q.trim().length === 0 ||
      query.q.trim().length > MAX_SEARCH_LENGTH
    ) {
      throw new RequestValidationError(
        `q must be between 1 and ${MAX_SEARCH_LENGTH} characters`
      );
    }

    const search = new RegExp(escapeRegex(query.q.trim()), "i");
    filter.$or = [
      { title: search },
      { summary: search },
      { description: search },
      { content: search },
      { sourceName: search },
    ];
  }

  if (query.category !== undefined) {
    if (
      typeof query.category !== "string" ||
      !query.category.trim() ||
      query.category.trim().length > 100
    ) {
      throw new RequestValidationError(
        "category must be between 1 and 100 characters"
      );
    }

    filter.category = new RegExp(escapeRegex(query.category.trim()), "i");
  }

  const tags = parseTags(query.tags);
  if (tags.length > 0) {
    filter.tags = {
      $in: tags.map((tag) => new RegExp(`^${escapeRegex(tag)}$`, "i")),
    };
  }

  return {
    filter,
    pagination: {
      page,
      limit,
      skip: (page - 1) * limit,
    },
  };
};

const sendError = (res, error, operation) => {
  if (error instanceof RequestValidationError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  console.error(`${operation} failed:`, error.message);
  return res.status(500).json({ message: `Unable to ${operation}` });
};

const sendPaginatedArticles = async (res, filter, pagination, staff = false) => {
  const sort = staff
    ? { createdAt: -1 }
    : { publishedAt: -1, createdAt: -1 };
  const [totalArticles, articles] = await Promise.all([
    Article.countDocuments(filter),
    Article.find(filter)
      .populate("author", staff ? "name email" : "name")
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit),
  ]);

  return res.json({
    totalArticles,
    currentPage: pagination.page,
    totalPages: Math.ceil(totalArticles / pagination.limit),
    articles,
  });
};

const validateArticleId = (id) => mongoose.isValidObjectId(id);

const validateArticleFields = (body, { creating = false } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Article data must be a JSON object");
  }

  const allowedFields = [
    "title",
    "summary",
    "description",
    "content",
    "category",
    "tags",
    "imageUrl",
    "sourceName",
    "sourceUrl",
    "eventDate",
  ];
  const unexpectedField = Object.keys(body).find(
    (field) => !allowedFields.includes(field)
  );

  if (unexpectedField) {
    throw new RequestValidationError(
      `Article field '${unexpectedField}' cannot be set`
    );
  }

  const fields = {};
  const stringLimits = {
    title: 200,
    summary: 2000,
    description: 500,
    content: 100000,
    category: 100,
    imageUrl: 2048,
    sourceName: 150,
    sourceUrl: 2048,
  };

  for (const [field, maximum] of Object.entries(stringLimits)) {
    if (body[field] === undefined) {
      continue;
    }

    const value =
      typeof body[field] === "string" ? body[field].trim() : undefined;
    if (
      value === undefined ||
      (!["imageUrl", "description", "sourceName", "sourceUrl"].includes(field) &&
        value.length === 0) ||
      value.length > maximum
    ) {
      throw new RequestValidationError(
        `${field} must be a ${field === "imageUrl" ? "string" : "non-empty string"} of at most ${maximum} characters`
      );
    }

    fields[field] = value;
  }

  if (fields.sourceUrl) {
    let sourceUrl;
    try {
      sourceUrl = new URL(fields.sourceUrl);
    } catch {
      throw new RequestValidationError("sourceUrl must be a valid HTTP or HTTPS URL");
    }

    if (!["http:", "https:"].includes(sourceUrl.protocol)) {
      throw new RequestValidationError("sourceUrl must be a valid HTTP or HTTPS URL");
    }
  }

  if (body.eventDate !== undefined) {
    if (body.eventDate === null || body.eventDate === "") {
      fields.eventDate = null;
    } else if (typeof body.eventDate === "string") {
      const eventDate = new Date(body.eventDate);
      if (Number.isNaN(eventDate.getTime())) {
        throw new RequestValidationError("eventDate must be a valid date and time");
      }
      fields.eventDate = eventDate;
    } else {
      throw new RequestValidationError("eventDate must be a valid date and time");
    }
  }

  if (body.tags !== undefined) {
    if (
      !Array.isArray(body.tags) ||
      body.tags.length > MAX_TAGS ||
      body.tags.some(
        (tag) =>
          typeof tag !== "string" ||
          !tag.trim() ||
          tag.trim().length > 50
      )
    ) {
      throw new RequestValidationError(
        `tags must be an array of at most ${MAX_TAGS} non-empty strings of 50 characters or fewer`
      );
    }

    fields.tags = [...new Set(body.tags.map((tag) => tag.trim()))];
  }

  if (creating) {
    for (const field of ["title", "summary", "content", "category"]) {
      if (fields[field] === undefined) {
        throw new RequestValidationError(`${field} is required`);
      }
    }

    fields.tags = fields.tags || [];
    fields.imageUrl = fields.imageUrl || "";
    fields.description = fields.description || "";
    fields.sourceName = fields.sourceName || "";
    fields.sourceUrl = fields.sourceUrl || "";
    fields.eventDate = fields.eventDate || null;
  } else if (Object.keys(fields).length === 0) {
    throw new RequestValidationError("No editable article fields provided");
  }

  return fields;
};

const createArticle = async (req, res) => {
  try {
    const fields = validateArticleFields(req.body, { creating: true });
    const article = await Article.create({
      ...fields,
      author: req.user._id,
      status: "Draft",
      publishedAt: null,
      rejectionReason: "",
    });

    return res.status(201).json({
      message: "Article created successfully",
      article,
    });
  } catch (error) {
    return sendError(res, error, "create article");
  }
};

const getPublishedArticles = async (req, res) => {
  try {
    const { filter, pagination } = parseListOptions(req.query);
    return await sendPaginatedArticles(res, filter, pagination);
  } catch (error) {
    return sendError(res, error, "list published articles");
  }
};

const getArticleById = async (req, res) => {
  if (!validateArticleId(req.params.id)) {
    return res.status(400).json({ message: "Invalid article ID" });
  }

  try {
    const article = await Article.findOne({
      _id: req.params.id,
      status: "Published",
    }).populate("author", "name");

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    return res.json(article);
  } catch (error) {
    return sendError(res, error, "get article");
  }
};

const getAllArticles = async (req, res) => {
  try {
    const { filter, pagination } = parseListOptions(req.query, {
      staff: true,
    });
    return await sendPaginatedArticles(res, filter, pagination, true);
  } catch (error) {
    return sendError(res, error, "list articles");
  }
};

const getMyArticles = async (req, res) => {
  try {
    const { filter, pagination } = parseListOptions(req.query, {
      staff: true,
    });
    filter.author = req.user._id;
    return await sendPaginatedArticles(res, filter, pagination, true);
  } catch (error) {
    return sendError(res, error, "list your articles");
  }
};

const getArticleForEditing = async (req, res) => {
  if (!validateArticleId(req.params.id)) {
    return res.status(400).json({ message: "Invalid article ID" });
  }

  try {
    const article = await Article.findById(req.params.id).populate(
      "author",
      "name email"
    );
    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }

    if (req.user.role !== "Admin") {
      if (String(article.author._id) !== String(req.user._id)) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!["Draft", "Rejected"].includes(article.status)) {
        return res.status(409).json({
          message: "Only draft or rejected articles can be edited",
        });
      }
    }

    return res.json(article);
  } catch (error) {
    return sendError(res, error, "get article for editing");
  }
};

const findArticleById = async (id, res) => {
  if (!validateArticleId(id)) {
    res.status(400).json({ message: "Invalid article ID" });
    return null;
  }

  const article = await Article.findById(id);
  if (!article) {
    res.status(404).json({ message: "Article not found" });
    return null;
  }

  return article;
};

const updateArticle = async (req, res) => {
  try {
    let article = await findArticleById(req.params.id, res);
    if (!article) {
      return;
    }

    const isAdmin = req.user.role === "Admin";
    const isOwner =
      String(article.author) === String(req.user._id);

    if (!isAdmin && (!isOwner || req.user.role !== "ContentCreator")) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isAdmin && !["Draft", "Rejected"].includes(article.status)) {
      return res.status(409).json({
        message: "Only draft or rejected articles can be edited",
      });
    }

    const fields = validateArticleFields(req.body);

    if (!isAdmin) {
      const update = { ...fields };
      if (article.status === "Rejected") {
        update.status = "Draft";
        update.rejectionReason = "";
        update.publishedAt = null;
      }

      article = await Article.findOneAndUpdate(
        {
          _id: article._id,
          author: req.user._id,
          status: { $in: ["Draft", "Rejected"] },
        },
        { $set: update },
        { returnDocument: "after", runValidators: true }
      );

      if (!article) {
        return res.status(409).json({
          message: "The article is no longer eligible for editing",
        });
      }
    } else {
      Object.assign(article, fields);
      if (article.status === "Rejected") {
        article.status = "Draft";
        article.rejectionReason = "";
        article.publishedAt = null;
      }

      await article.save();
    }

    return res.json({
      message: "Article updated successfully",
      article,
    });
  } catch (error) {
    return sendError(res, error, "update article");
  }
};

const submitArticle = async (req, res) => {
  try {
    const article = await findArticleById(req.params.id, res);
    if (!article) {
      return;
    }

    const isOwner = String(article.author) === String(req.user._id);
    if (req.user.role !== "Admin" && !isOwner) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!["Draft", "Rejected"].includes(article.status)) {
      return res.status(409).json({
        message: "Only draft or rejected articles can be submitted",
      });
    }

    const submitted = await Article.findOneAndUpdate(
      {
        _id: article._id,
        status: { $in: ["Draft", "Rejected"] },
      },
      {
        $set: {
          status: "Pending",
          rejectionReason: "",
          publishedAt: null,
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!submitted) {
      return res.status(409).json({
        message: "The article is no longer eligible for submission",
      });
    }

    return res.json({
      message: "Article submitted for review",
      article: submitted,
    });
  } catch (error) {
    return sendError(res, error, "submit article");
  }
};

const publishArticle = async (req, res) => {
  try {
    const article = await findArticleById(req.params.id, res);
    if (!article) {
      return;
    }

    if (article.status !== "Pending") {
      return res.status(409).json({
        message: "Only pending articles can be published",
      });
    }

    const published = await Article.findOneAndUpdate(
      { _id: article._id, status: "Pending" },
      {
        $set: {
          status: "Published",
          publishedAt: new Date(),
          rejectionReason: "",
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!published) {
      return res.status(409).json({
        message: "The article has already changed from Pending",
      });
    }

    return res.json({
      message: "Article published successfully",
      article: published,
    });
  } catch (error) {
    return sendError(res, error, "publish article");
  }
};

const rejectArticle = async (req, res) => {
  const { reason } = req.body || {};
  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > MAX_REJECTION_REASON_LENGTH
  ) {
    return res.status(400).json({
      message: `A rejection reason of 1-${MAX_REJECTION_REASON_LENGTH} characters is required`,
    });
  }

  try {
    const article = await findArticleById(req.params.id, res);
    if (!article) {
      return;
    }

    if (article.status !== "Pending") {
      return res.status(409).json({
        message: "Only pending articles can be rejected",
      });
    }

    const rejected = await Article.findOneAndUpdate(
      { _id: article._id, status: "Pending" },
      {
        $set: {
          status: "Rejected",
          rejectionReason: reason.trim(),
          publishedAt: null,
        },
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!rejected) {
      return res.status(409).json({
        message: "The article has already changed from Pending",
      });
    }

    return res.json({
      message: "Article rejected",
      article: rejected,
    });
  } catch (error) {
    return sendError(res, error, "reject article");
  }
};

const deleteArticle = async (req, res) => {
  try {
    const article = await findArticleById(req.params.id, res);
    if (!article) {
      return;
    }

    const isAdmin = req.user.role === "Admin";
    const isOwner =
      String(article.author) === String(req.user._id);

    if (!isAdmin && (!isOwner || req.user.role !== "ContentCreator")) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!isAdmin && !["Draft", "Rejected"].includes(article.status)) {
      return res.status(409).json({
        message: "Only draft or rejected articles can be deleted",
      });
    }

    if (isAdmin) {
      await article.deleteOne();
    } else {
      const deleted = await Article.findOneAndDelete({
        _id: article._id,
        author: req.user._id,
        status: { $in: ["Draft", "Rejected"] },
      });

      if (!deleted) {
        return res.status(409).json({
          message: "The article is no longer eligible for deletion",
        });
      }
    }
    return res.json({ message: "Article deleted successfully" });
  } catch (error) {
    return sendError(res, error, "delete article");
  }
};

module.exports = {
  createArticle,
  getPublishedArticles,
  getArticleById,
  getAllArticles,
  getMyArticles,
  getArticleForEditing,
  updateArticle,
  submitArticle,
  publishArticle,
  rejectArticle,
  deleteArticle,
  parseListOptions,
  validateArticleFields,
};
