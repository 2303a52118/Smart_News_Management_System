const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEnv } = require("../config/env");

test("requires MongoDB URI and JWT secret without exposing their values", () => {
  assert.throws(
    () => validateEnv({}),
    {
      message: "Missing required environment variable(s): MONGO_URI, JWT_SECRET",
    }
  );
});

test("rejects blank required environment values", () => {
  assert.throws(
    () => validateEnv({ MONGO_URI: " ", JWT_SECRET: "secret" }),
    /MONGO_URI/
  );
});

test("uses the default port when PORT is not set", () => {
  assert.deepEqual(
    validateEnv({ MONGO_URI: "mongodb://localhost/news", JWT_SECRET: "secret" }),
    { port: 5000 }
  );
});

test("accepts a valid configured port", () => {
  assert.deepEqual(
    validateEnv({
      MONGO_URI: "mongodb://localhost/news",
      JWT_SECRET: "secret",
      PORT: "5500",
    }),
    { port: 5500 }
  );
});

test("rejects an invalid configured port", () => {
  assert.throws(
    () =>
      validateEnv({
        MONGO_URI: "mongodb://localhost/news",
        JWT_SECRET: "secret",
        PORT: "70000",
      }),
    /PORT must be an integer/
  );
});
