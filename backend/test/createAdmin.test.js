const test = require("node:test");
const assert = require("node:assert/strict");
const { createInitialAdmin } = require("../scripts/createAdmin");

test("initial Admin bootstrap rejects a weak password before connecting", async () => {
  await assert.rejects(
    createInitialAdmin({
      MONGO_URI: "mongodb://127.0.0.1:27017/smart-news-platform",
      JWT_SECRET: "test-only-secret",
      ADMIN_NAME: "Admin",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "too-short",
    }),
    /at least 12 characters/
  );
});
