const test = require("node:test");
const assert = require("node:assert/strict");
const Article = require("../models/article");
const ReaderInteraction = require("../models/readerinteraction");
const User = require("../models/user");
const {
  likeArticle,
  unlikeArticle,
  bookmarkArticle,
  getArticleInteraction,
  recordArticleView,
  updateInterests,
} = require("../controllers/readerController");

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

test("reader interaction schema enforces one record per reader and article", () => {
  const uniqueIndex = ReaderInteraction.schema
    .indexes()
    .find(([keys, options]) => keys.user === 1 && keys.article === 1 && options.unique);

  assert.ok(uniqueIndex);
});

test("like endpoint creates one like and increments the article counter once", async () => {
  const originals = {
    articleFindOne: Article.findOne,
    interactionUpsert: ReaderInteraction.findOneAndUpdate,
    interactionUpdate: ReaderInteraction.updateOne,
    articleUpdate: Article.updateOne,
  };
  let likeUpdate;
  let articleUpdate;
  Article.findOne = async () => ({ _id: articleId, status: "Published" });
  ReaderInteraction.findOneAndUpdate = async () => ({});
  ReaderInteraction.updateOne = async () => ({ modifiedCount: 1 });
  Article.updateOne = async (...args) => {
    articleUpdate = args;
    return { modifiedCount: 1 };
  };

  try {
    const response = createResponse();
    await likeArticle(
      { params: { id: articleId }, user: { _id: "reader-id" } },
      response
    );
    likeUpdate = response.body;
    assert.deepEqual(likeUpdate, { liked: true });
    assert.deepEqual(articleUpdate[1], { $inc: { likes: 1 } });
  } finally {
    Article.findOne = originals.articleFindOne;
    ReaderInteraction.findOneAndUpdate = originals.interactionUpsert;
    ReaderInteraction.updateOne = originals.interactionUpdate;
    Article.updateOne = originals.articleUpdate;
  }
});

test("repeated like does not increment article like count again", async () => {
  const originals = {
    articleFindOne: Article.findOne,
    interactionUpsert: ReaderInteraction.findOneAndUpdate,
    interactionUpdate: ReaderInteraction.updateOne,
    articleUpdate: Article.updateOne,
  };
  let counterUpdates = 0;
  Article.findOne = async () => ({ _id: articleId, status: "Published" });
  ReaderInteraction.findOneAndUpdate = async () => ({});
  ReaderInteraction.updateOne = async () => ({ modifiedCount: 0 });
  Article.updateOne = async () => {
    counterUpdates += 1;
    return { modifiedCount: 1 };
  };

  try {
    const response = createResponse();
    await likeArticle(
      { params: { id: articleId }, user: { _id: "reader-id" } },
      response
    );
    assert.equal(response.body.liked, true);
    assert.equal(counterUpdates, 0);
  } finally {
    Article.findOne = originals.articleFindOne;
    ReaderInteraction.findOneAndUpdate = originals.interactionUpsert;
    ReaderInteraction.updateOne = originals.interactionUpdate;
    Article.updateOne = originals.articleUpdate;
  }
});

test("unlike only decrements the aggregate when the reader had liked it", async () => {
  const originals = {
    articleFindOne: Article.findOne,
    interactionUpdate: ReaderInteraction.updateOne,
    articleUpdate: Article.updateOne,
  };
  let counterUpdates = 0;
  Article.findOne = async () => ({ _id: articleId, status: "Published" });
  ReaderInteraction.updateOne = async () => ({ modifiedCount: 0 });
  Article.updateOne = async () => {
    counterUpdates += 1;
  };

  try {
    const response = createResponse();
    await unlikeArticle(
      { params: { id: articleId }, user: { _id: "reader-id" } },
      response
    );
    assert.deepEqual(response.body, { liked: false });
    assert.equal(counterUpdates, 0);
  } finally {
    Article.findOne = originals.articleFindOne;
    ReaderInteraction.updateOne = originals.interactionUpdate;
    Article.updateOne = originals.articleUpdate;
  }
});

test("reader must submit a bounded array of interests", async () => {
  const originalUpdate = User.findByIdAndUpdate;
  let update;
  User.findByIdAndUpdate = (...args) => {
    update = args;
    return {
      select: async () => ({ interests: ["Science", "Technology"] }),
    };
  };

  try {
    const invalidResponse = createResponse();
    await updateInterests(
      { body: { interests: ["Science", ""] }, user: { _id: "reader-id" } },
      invalidResponse
    );
    assert.equal(invalidResponse.statusCode, 400);

    const response = createResponse();
    await updateInterests(
      {
        body: { interests: [" Science ", "Technology", "Science"] },
        user: { _id: "reader-id" },
      },
      response
    );
    assert.deepEqual(update[1].$set.interests, ["Science", "Technology"]);
    assert.deepEqual(response.body.interests, ["Science", "Technology"]);
  } finally {
    User.findByIdAndUpdate = originalUpdate;
  }
});

test("view tracking rejects invalid IDs without a database query", async () => {
  const originalFindOne = Article.findOne;
  Article.findOne = () => {
    throw new Error("Database should not be queried");
  };

  try {
    const response = createResponse();
    await recordArticleView(
      { params: { id: "invalid" }, user: { _id: "reader-id" } },
      response
    );
    assert.equal(response.statusCode, 400);
  } finally {
    Article.findOne = originalFindOne;
  }
});

test("bookmark on a non-published article is rejected", async () => {
  const originalFindOne = Article.findOne;
  Article.findOne = async () => null;

  try {
    const response = createResponse();
    await bookmarkArticle(
      { params: { id: articleId }, user: { _id: "reader-id" } },
      response
    );
    assert.equal(response.statusCode, 404);
  } finally {
    Article.findOne = originalFindOne;
  }
});

test("interaction state is queried for the authenticated reader only", async () => {
  const originals = {
    articleFindOne: Article.findOne,
    interactionFindOne: ReaderInteraction.findOne,
  };
  let interactionFilter;
  Article.findOne = async () => ({ _id: articleId, status: "Published" });
  ReaderInteraction.findOne = (filter) => {
    interactionFilter = filter;
    return {
      select: () => ({
        lean: async () => ({ isLiked: true, isBookmarked: false }),
      }),
    };
  };

  try {
    const response = createResponse();
    await getArticleInteraction(
      {
        params: {},
        query: { articleId },
        user: { _id: "current-reader" },
      },
      response
    );

    assert.deepEqual(interactionFilter, {
      user: "current-reader",
      article: articleId,
    });
    assert.deepEqual(response.body, { liked: true, bookmarked: false });
  } finally {
    Article.findOne = originals.articleFindOne;
    ReaderInteraction.findOne = originals.interactionFindOne;
  }
});
