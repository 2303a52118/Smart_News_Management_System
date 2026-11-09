const test = require("node:test");
const assert = require("node:assert/strict");
const Category = require("../models/category");
const { deleteCategory } = require("../controllers/categoryController");

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

test("category deletion deactivates the record instead of removing it", async () => {
  const originalFindById = Category.findById;
  const category = {
    isActive: true,
    saved: false,
    async save() {
      this.saved = true;
    },
  };

  Category.findById = async () => category;

  try {
    const response = createResponse();
    await deleteCategory(
      { params: { id: "0123456789abcdef01234567" } },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(category.isActive, false);
    assert.equal(category.saved, true);
    assert.match(response.body.message, /deactivated/);
  } finally {
    Category.findById = originalFindById;
  }
});
