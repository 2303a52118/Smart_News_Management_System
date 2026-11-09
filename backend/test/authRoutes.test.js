const test = require("node:test");
const assert = require("node:assert/strict");

test("auth routes load using the controller's exact filename casing", () => {
  assert.doesNotThrow(() => require("../routes/authRoutes"));
  assert.doesNotThrow(() => require("../routes/accountRoutes"));
});

test("admin and category routes load", () => {
  assert.doesNotThrow(() => require("../routes/adminRoutes"));
  assert.doesNotThrow(() => require("../routes/categoryRoutes"));
});

test("reader engagement and comment routes load", () => {
  assert.doesNotThrow(() => require("../routes/readerRoutes"));
  assert.doesNotThrow(() => require("../routes/readerInteractionRoutes"));
  assert.doesNotThrow(() => require("../routes/commentRoutes"));
  assert.doesNotThrow(() => require("../routes/recommendationRoutes"));
});
