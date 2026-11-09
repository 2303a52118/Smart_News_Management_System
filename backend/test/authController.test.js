const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const User = require("../models/user");
const { registerUser, loginUser } = require("../controllers/authController");

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

test("public registration supports Reader and Creator and holds Editor access for Admin approval", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const previousSecret = process.env.JWT_SECRET;
  const createdUsers = [];
  process.env.JWT_SECRET = "test-only-secret";
  User.findOne = async () => null;
  User.create = async (user) => {
    const createdUser = { ...user, _id: `user-${createdUsers.length}` };
    createdUsers.push(createdUser);
    return createdUser;
  };

  try {
    for (const [role, expectedRole, expectedApplication] of [
      ["Reader", "Reader", "NotRequested"],
      ["ContentCreator", "ContentCreator", "NotRequested"],
      ["Editor", "Reader", "Pending"],
    ]) {
      const response = createResponse();
      await registerUser(
        {
          body: {
            name: role,
            email: `${role}@EXAMPLE.COM`,
            password: "password123",
            role,
          },
        },
        response
      );

      const createdUser = createdUsers.at(-1);
      assert.equal(response.statusCode, 201);
      assert.equal(createdUser.role, expectedRole);
      assert.equal(createdUser.editorApplicationStatus, expectedApplication);
      assert.equal(createdUser.email, `${role.toLowerCase()}@example.com`);
      assert.notEqual(createdUser.password, "password123");
      assert.equal(response.body.user.role, expectedRole);
    }

    const adminResponse = createResponse();
    await registerUser(
      {
        body: {
          name: "Public Admin",
          email: "public-admin@example.com",
          password: "password123",
          role: "Admin",
        },
      },
      adminResponse
    );
    assert.equal(adminResponse.statusCode, 400);
    assert.equal(createdUsers.length, 3);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }
  }
});

test("inactive accounts cannot log in with valid credentials", async () => {
  const originalFindOne = User.findOne;
  const password = "valid-password";
  User.findOne = async () => ({
    isActive: false,
    password: await bcrypt.hash(password, 4),
  });

  try {
    const response = createResponse();
    await loginUser(
      { body: { email: "user@example.com", password } },
      response
    );

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, "This account is deactivated");
  } finally {
    User.findOne = originalFindOne;
  }
});
