const test = require("node:test");
const assert = require("node:assert/strict");
const Article = require("../models/article");
const {
  getPublishedArticles,
  getArticleById,
  getMyArticles,
  getArticleForEditing,
  updateArticle,
  submitArticle,
  publishArticle,
  rejectArticle,
  parseListOptions,
  validateArticleFields,
} = require("../controllers/articleController");

const articleId = "0123456789abcdef01234567";

const createResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("public article filters search all text fields and stay Published-only", () => {
  const { filter, pagination } = parseListOptions({
    q: "Climate.*",
    category: "Science",
    tags: "AI,Policy",
    page: "3",
    limit: "20",
  });

  assert.equal(filter.status, "Published");
  assert.equal(filter.$or.length, 5);
  assert.equal(filter.$or[0].title.test("CLIMATE.*"), true);
  assert.equal(filter.$or[0].title.test("Climate123"), false);
  assert.equal(filter.category.test("science"), true);
  assert.equal(filter.tags.$in.length, 2);
  assert.deepEqual(pagination, { page: 3, limit: 20, skip: 40 });
});

test("staff can filter by an allowed publishing status", () => {
  const { filter } = parseListOptions(
    { status: "Pending" },
    { staff: true }
  );
  assert.equal(filter.status, "Pending");
});

test("public callers cannot select an article status", () => {
  assert.throws(
    () => parseListOptions({ status: "Draft" }),
    /only available to Admins and Editors/
  );
});

test("pagination and filter inputs reject invalid values", () => {
  for (const query of [
    { page: "0" },
    { page: "1.5" },
    { page: "10001" },
    { limit: "101" },
    { limit: "-1" },
    { status: "Draft" },
    { q: " " },
    { q: "x".repeat(201) },
    { tags: ["", "valid"] },
  ]) {
    assert.throws(() => parseListOptions(query), undefined, JSON.stringify(query));
  }
});

test("article input rejects caller-controlled workflow fields", () => {
  assert.throws(
    () =>
      validateArticleFields({
        title: "Headline",
        status: "Published",
      }),
    /cannot be set/
  );
});

test("article input accepts an empty optional image URL", () => {
  const fields = validateArticleFields(
    {
      title: "Headline",
      summary: "Summary",
      content: "Article text",
      category: "Science",
      imageUrl: "",
    },
    { creating: true }
  );
  assert.equal(fields.imageUrl, "");
});

test("article input preserves source and event metadata and rejects unsafe source URLs", () => {
  const fields = validateArticleFields(
    {
      title: "Headline",
      summary: "Summary",
      description: "Short description",
      content: "Article text",
      category: "Science",
      sourceName: "Example News",
      sourceUrl: "https://example.com/story",
      eventDate: "2026-03-01T10:30:00.000Z",
    },
    { creating: true }
  );
  assert.equal(fields.description, "Short description");
  assert.equal(fields.sourceName, "Example News");
  assert.equal(fields.sourceUrl, "https://example.com/story");
  assert.equal(fields.eventDate.toISOString(), "2026-03-01T10:30:00.000Z");
  assert.throws(
    () =>
      validateArticleFields({
        sourceUrl: "javascript:alert(1)",
      }),
    /HTTP or HTTPS/
  );
  assert.throws(
    () => validateArticleFields({ eventDate: "not-a-date" }),
    /valid date and time/
  );
});

test("public article list returns pagination metadata and enforces Published", async () => {
  const originalCountDocuments = Article.countDocuments;
  const originalFind = Article.find;
  let filterUsed;
  Article.countDocuments = async (filter) => {
    filterUsed = filter;
    return 3;
  };
  Article.find = (filter) => {
    filterUsed = filter;
    const query = {
      populate() {
        return this;
      },
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      async limit() {
        return [{ title: "Published story", status: "Published" }];
      },
    };
    return query;
  };

  try {
    const response = createResponse();
    await getPublishedArticles(
      { query: { page: "2", limit: "1", status: undefined } },
      response
    );

    assert.equal(filterUsed.status, "Published");
    assert.equal(response.body.totalArticles, 3);
    assert.equal(response.body.currentPage, 2);
    assert.equal(response.body.totalPages, 3);
    assert.equal(response.body.articles.length, 1);
  } finally {
    Article.countDocuments = originalCountDocuments;
    Article.find = originalFind;
  }
});

test("public article details query Published articles only", async () => {
  const originalFindOne = Article.findOne;
  let filterUsed;
  Article.findOne = (filter) => {
    filterUsed = filter;
    return {
      populate: async () => ({ status: "Published", title: "Story" }),
    };
  };

  try {
    const response = createResponse();
    await getArticleById({ params: { id: articleId } }, response);

    assert.equal(filterUsed._id, articleId);
    assert.equal(filterUsed.status, "Published");
    assert.equal(response.body.status, "Published");
  } finally {
    Article.findOne = originalFindOne;
  }
});

test("public detail endpoint hides articles that are not published", async () => {
  const originalFindOne = Article.findOne;
  Article.findOne = () => ({
    populate: async () => null,
  });

  try {
    const response = createResponse();
    await getArticleById({ params: { id: articleId } }, response);
    assert.equal(response.statusCode, 404);
  } finally {
    Article.findOne = originalFindOne;
  }
});

test("article endpoints reject malformed IDs before querying MongoDB", async () => {
  const originalFindOne = Article.findOne;
  Article.findOne = () => {
    throw new Error("Database should not be queried");
  };

  try {
    const response = createResponse();
    await getArticleById({ params: { id: "invalid-id" } }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, "Invalid article ID");
  } finally {
    Article.findOne = originalFindOne;
  }
});

test("creator article listing is scoped to the signed-in author", async () => {
  const originalCountDocuments = Article.countDocuments;
  const originalFind = Article.find;
  let filterUsed;
  Article.countDocuments = async (filter) => {
    filterUsed = filter;
    return 0;
  };
  Article.find = (filter) => {
    filterUsed = filter;
    return {
      populate() {
        return this;
      },
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      async limit() {
        return [];
      },
    };
  };

  try {
    const response = createResponse();
    await getMyArticles(
      { query: {}, user: { _id: "creator-id" } },
      response
    );
    assert.equal(filterUsed.author, "creator-id");
    assert.equal(response.body.totalArticles, 0);
  } finally {
    Article.countDocuments = originalCountDocuments;
    Article.find = originalFind;
  }
});

test("Admin can load an article from another author for editing", async () => {
  const originalFindById = Article.findById;
  const article = {
    _id: articleId,
    title: "Another author's story",
    author: { _id: "author-id", name: "Author" },
    status: "Published",
  };
  Article.findById = () => ({ populate: async () => article });

  try {
    const response = createResponse();
    await getArticleForEditing(
      { params: { id: articleId }, user: { _id: "admin-id", role: "Admin" } },
      response
    );
    assert.equal(response.body.title, "Another author's story");
  } finally {
    Article.findById = originalFindById;
  }
});

test("creator cannot load another author's article for editing", async () => {
  const originalFindById = Article.findById;
  Article.findById = () => ({
    populate: async () => ({
      author: { _id: "different-author" },
      status: "Draft",
    }),
  });

  try {
    const response = createResponse();
    await getArticleForEditing(
      {
        params: { id: articleId },
        user: { _id: "creator-id", role: "ContentCreator" },
      },
      response
    );
    assert.equal(response.statusCode, 403);
  } finally {
    Article.findById = originalFindById;
  }
});

test("creators cannot edit another author's article", async () => {
  const originalFindById = Article.findById;
  Article.findById = async () => ({
    author: "another-author",
    status: "Draft",
  });

  try {
    const response = createResponse();
    await updateArticle(
      {
        params: { id: articleId },
        body: { title: "Changed title" },
        user: { _id: "creator-id", role: "ContentCreator" },
      },
      response
    );

    assert.equal(response.statusCode, 403);
  } finally {
    Article.findById = originalFindById;
  }
});

test("creators cannot edit an article after submission", async () => {
  const originalFindById = Article.findById;
  Article.findById = async () => ({
    author: "creator-id",
    status: "Pending",
  });

  try {
    const response = createResponse();
    await updateArticle(
      {
        params: { id: articleId },
        body: { title: "Changed title" },
        user: { _id: "creator-id", role: "ContentCreator" },
      },
      response
    );

    assert.equal(response.statusCode, 409);
  } finally {
    Article.findById = originalFindById;
  }
});

test("publishing rejects articles that were not submitted for review", async () => {
  const originalFindById = Article.findById;
  const originalFindOneAndUpdate = Article.findOneAndUpdate;
  Article.findById = async () => ({ status: "Published" });
  Article.findOneAndUpdate = () => {
    throw new Error("Invalid transitions must not be updated");
  };

  try {
    const response = createResponse();
    await publishArticle(
      { params: { id: articleId }, user: { role: "Editor" } },
      response
    );

    assert.equal(response.statusCode, 409);
  } finally {
    Article.findById = originalFindById;
    Article.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("publishing a pending article sets publishedAt and transitions once", async () => {
  const originalFindById = Article.findById;
  const originalFindOneAndUpdate = Article.findOneAndUpdate;
  const pendingArticle = { _id: articleId, status: "Pending" };
  let update;
  Article.findById = async () => pendingArticle;
  Article.findOneAndUpdate = async (_filter, updateDocument) => {
    update = updateDocument;
    return {
      _id: articleId,
      status: updateDocument.$set.status,
      publishedAt: updateDocument.$set.publishedAt,
    };
  };

  try {
    const response = createResponse();
    await publishArticle(
      { params: { id: articleId }, user: { role: "Editor" } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(update.$set.status, "Published");
    assert.ok(update.$set.publishedAt instanceof Date);
    assert.ok(response.body.article.publishedAt instanceof Date);
  } finally {
    Article.findById = originalFindById;
    Article.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("a concurrent duplicate publish returns a conflict", async () => {
  const originalFindById = Article.findById;
  const originalFindOneAndUpdate = Article.findOneAndUpdate;
  Article.findById = async () => ({ _id: articleId, status: "Pending" });
  Article.findOneAndUpdate = async () => null;

  try {
    const response = createResponse();
    await publishArticle(
      { params: { id: articleId }, user: { role: "Editor" } },
      response
    );
    assert.equal(response.statusCode, 409);
  } finally {
    Article.findById = originalFindById;
    Article.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("rejection requires a reason and stores it on the article", async () => {
  const originalFindById = Article.findById;
  const originalFindOneAndUpdate = Article.findOneAndUpdate;
  const pendingArticle = { _id: articleId, status: "Pending" };
  let update;
  Article.findById = async () => pendingArticle;
  Article.findOneAndUpdate = async (_filter, updateDocument) => {
    update = updateDocument;
    return { status: "Rejected", ...updateDocument.$set };
  };

  try {
    const missingReasonResponse = createResponse();
    await rejectArticle(
      { params: { id: articleId }, body: {} },
      missingReasonResponse
    );
    assert.equal(missingReasonResponse.statusCode, 400);

    const response = createResponse();
    await rejectArticle(
      {
        params: { id: articleId },
        body: { reason: "  Add better sources.  " },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(update.$set.status, "Rejected");
    assert.equal(update.$set.rejectionReason, "Add better sources.");
    assert.equal(response.body.article.rejectionReason, "Add better sources.");
  } finally {
    Article.findById = originalFindById;
    Article.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("submission permits only the article owner and eligible states", async () => {
  const originalFindById = Article.findById;
  const originalFindOneAndUpdate = Article.findOneAndUpdate;
  Article.findById = async () => ({
    _id: articleId,
    author: "creator-id",
    status: "Draft",
  });
  Article.findOneAndUpdate = async () => ({
    _id: articleId,
    status: "Pending",
  });

  try {
    const response = createResponse();
    await submitArticle(
      {
        params: { id: articleId },
        user: { _id: "creator-id", role: "ContentCreator" },
      },
      response
    );
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.article.status, "Pending");
  } finally {
    Article.findById = originalFindById;
    Article.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
