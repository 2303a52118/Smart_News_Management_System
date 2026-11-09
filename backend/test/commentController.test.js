const test = require("node:test");
const assert = require("node:assert/strict");
const Article = require("../models/article");
const Comment = require("../models/comment");
const {
  createComment,
  getComments,
  getModerationQueue,
  updateComment,
  moderateComment,
} = require("../controllers/commentController");

const articleId = "0123456789abcdef01234567";
const commentId = "1123456789abcdef01234567";

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

test("comment schema includes moderation statuses and reason", () => {
  assert.deepEqual(Comment.schema.path("status").enumValues, [
    "Pending",
    "Approved",
    "Rejected",
  ]);
  assert.ok(Comment.schema.path("moderationReason"));
});

test("submitted comments are pending moderation", async () => {
  const originalFindOne = Article.findOne;
  const originalCreate = Comment.create;
  Article.findOne = async () => ({ _id: articleId, status: "Published" });
  Comment.create = async (data) => ({
    ...data,
    populate: async () => {},
  });

  try {
    const response = createResponse();
    await createComment(
      {
        params: { id: articleId },
        body: { content: "  Reader comment  " },
        user: { _id: "reader-id" },
      },
      response
    );
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.comment.content, "Reader comment");
    assert.equal(response.body.comment.status, "Pending");
  } finally {
    Article.findOne = originalFindOne;
    Comment.create = originalCreate;
  }
});

test("public comments query approved status only", async () => {
  const originalFindOne = Article.findOne;
  const originalCount = Comment.countDocuments;
  const originalFind = Comment.find;
  let filter;
  Article.findOne = async () => ({ _id: articleId, status: "Published" });
  Comment.countDocuments = async (query) => {
    filter = query;
    return 1;
  };
  Comment.find = (query) => {
    filter = query;
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
        return [{ status: "Approved" }];
      },
    };
  };

  try {
    const response = createResponse();
    await getComments({ params: { id: articleId }, query: {} }, response);
    assert.equal(filter.status, "Approved");
    assert.equal(response.body.totalComments, 1);
  } finally {
    Article.findOne = originalFindOne;
    Comment.countDocuments = originalCount;
    Comment.find = originalFind;
  }
});

test("moderation queue defaults to pending and reports pagination", async () => {
  const originalCount = Comment.countDocuments;
  const originalFind = Comment.find;
  let filter;
  Comment.countDocuments = async (query) => {
    filter = query;
    return 2;
  };
  Comment.find = (query) => {
    filter = query;
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
        return [{ status: "Pending" }];
      },
    };
  };

  try {
    const response = createResponse();
    await getModerationQueue({ query: { page: "2", limit: "1" } }, response);
    assert.deepEqual(filter, { status: "Pending" });
    assert.equal(response.body.currentPage, 2);
    assert.equal(response.body.totalPages, 2);
    assert.equal(response.body.totalComments, 2);
  } finally {
    Comment.countDocuments = originalCount;
    Comment.find = originalFind;
  }
});

test("a reader cannot moderate a comment", async () => {
  const response = createResponse();
  await moderateComment(
    {
      params: { id: commentId },
      body: { status: "Approved" },
      user: { role: "Reader" },
    },
    response
  );
  assert.equal(response.statusCode, 403);
});

test("moderators must give a reason when rejecting a comment", async () => {
  const response = createResponse();
  await moderateComment(
    {
      params: { id: commentId },
      body: { status: "Rejected" },
      user: { role: "Editor" },
    },
    response
  );
  assert.equal(response.statusCode, 400);
});

test("an owner cannot edit an approved comment", async () => {
  const originalFindById = Comment.findById;
  Comment.findById = async () => ({
    author: "reader-id",
    status: "Approved",
  });

  try {
    const response = createResponse();
    await updateComment(
      {
        params: { id: commentId },
        body: { content: "Edited" },
        user: { _id: "reader-id" },
      },
      response
    );
    assert.equal(response.statusCode, 409);
  } finally {
    Comment.findById = originalFindById;
  }
});
