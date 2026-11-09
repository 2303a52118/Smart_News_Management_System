const test = require("node:test");
const assert = require("node:assert/strict");
const Category = require("../models/category");
const { suggestWriting } = require("../controllers/writingAssistantController");

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

const makeCategoryQuery = (categories) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  lean: async () => categories,
});

test("writing assistant returns validated suggestions without saving or publishing", async () => {
  const originalFind = Category.find;
  const originalFetch = global.fetch;
  const previousUrl = process.env.OLLAMA_BASE_URL;
  const previousModel = process.env.OLLAMA_MODEL;
  let requestBody;
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
  process.env.OLLAMA_MODEL = "test-model";
  Category.find = () => makeCategoryQuery([{ name: "Science" }]);
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          response: JSON.stringify({
            headline: "A clearer headline",
            summary: "A concise summary",
            description: "A concise description",
            rewrittenContent: "Edited article text",
            category: "Science",
            tags: ["research"],
            grammarNotes: ["Clarified the opening sentence."],
          }),
        };
      },
    };
  };

  try {
    const response = createResponse();
    await suggestWriting(
      {
        body: {
          title: "Original headline",
          summary: "Original summary",
          content: "Article text with its original facts.",
          category: "Science",
          tags: ["research"],
        },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.suggestions.headline, "A clearer headline");
    assert.equal(response.body.suggestions.category, "Science");
    assert.equal(requestBody.model, "test-model");
    assert.equal(requestBody.stream, false);
    assert.match(response.body.notice, /nothing is saved or published automatically/);
  } finally {
    Category.find = originalFind;
    global.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousUrl;
    if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previousModel;
  }
});

test("writing assistant rejects invalid draft fields before contacting Ollama", async () => {
  const originalFetch = global.fetch;
  let contactedModel = false;
  global.fetch = async () => {
    contactedModel = true;
    throw new Error("Model must not be called");
  };

  try {
    const response = createResponse();
    await suggestWriting(
      { body: { content: "Draft", status: "Published" } },
      response
    );
    assert.equal(response.statusCode, 400);
    assert.equal(contactedModel, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("writing assistant refuses a non-local Ollama URL", async () => {
  const originalUrl = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = "https://example.com";

  try {
    const response = createResponse();
    await suggestWriting({ body: { content: "Draft" } }, response);
    assert.equal(response.statusCode, 500);
    assert.match(response.body.message, /local Ollama service/);
  } finally {
    if (originalUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalUrl;
  }
});
