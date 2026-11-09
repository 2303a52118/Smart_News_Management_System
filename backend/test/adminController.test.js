const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/user");
const {
  createStaffUser,
  reviewEditorApplication,
  updateUserRole,
} = require("../controllers/adminController");

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

test("Admin user creation supports each managed role", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  User.findOne = async () => null;
  User.create = async (user) => ({ ...user, _id: "managed-user-id" });

  try {
    for (const role of ["Admin", "Editor", "ContentCreator", "Reader"]) {
      const response = createResponse();
      await createStaffUser(
        {
          body: {
            name: "Managed User",
            email: `${role.toLowerCase()}@example.com`,
            password: "a-secure-password",
            role,
          },
        },
        response
      );
      assert.equal(response.statusCode, 201);
      assert.equal(response.body.user.role, role);
      assert.equal(Object.hasOwn(response.body.user, "password"), false);
    }
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("Admin user creation rejects invalid roles", async () => {
  const response = createResponse();

  await createStaffUser(
    {
      body: {
        name: "Reader",
        email: "reader@example.com",
        password: "a-secure-password",
        role: "InvalidRole",
      },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Invalid user role/);
});

test("staff creation hashes the password and returns no credential", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdUser;

  User.findOne = async () => null;
  User.create = async (user) => {
    createdUser = { ...user, _id: "staff-id" };
    return createdUser;
  };

  try {
    const response = createResponse();
    await createStaffUser(
      {
        body: {
          name: " Content Creator ",
          email: " CREATOR@Example.com ",
          password: "a-secure-password",
          role: "ContentCreator",
        },
      },
      response
    );

    assert.equal(response.statusCode, 201);
    assert.equal(createdUser.name, "Content Creator");
    assert.equal(createdUser.email, "creator@example.com");
    assert.equal(createdUser.role, "ContentCreator");
    assert.notEqual(createdUser.password, "a-secure-password");
    assert.equal(Object.hasOwn(response.body.user, "password"), false);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("admin cannot demote their own account, even with uppercase ID casing", async () => {
  const response = createResponse();
  const adminId = "0123456789abcdef01234567";

  await updateUserRole(
    {
      params: { id: adminId.toUpperCase() },
      body: { role: "Reader" },
      user: { _id: adminId },
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /own role/);
});

test("Admin approval grants Editor role only to a pending application", async () => {
  const originalFindById = User.findById;
  const user = {
    _id: "0123456789abcdef01234567",
    name: "Applicant",
    email: "applicant@example.com",
    role: "Reader",
    editorApplicationStatus: "Pending",
    isActive: true,
    async save() {},
  };
  User.findById = async () => user;

  try {
    const response = createResponse();
    await reviewEditorApplication(
      {
        params: { id: user._id },
        body: { decision: "Approved" },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(user.role, "Editor");
    assert.equal(user.editorApplicationStatus, "Approved");
    assert.equal("password" in response.body.user, false);
  } finally {
    User.findById = originalFindById;
  }
});

test("Admin rejection leaves the applicant as a Reader", async () => {
  const originalFindById = User.findById;
  const user = {
    _id: "0123456789abcdef01234567",
    name: "Applicant",
    email: "applicant@example.com",
    role: "Reader",
    editorApplicationStatus: "Pending",
    isActive: true,
    async save() {},
  };
  User.findById = async () => user;

  try {
    const response = createResponse();
    await reviewEditorApplication(
      {
        params: { id: user._id },
        body: { decision: "Rejected" },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(user.role, "Reader");
    assert.equal(user.editorApplicationStatus, "Rejected");
  } finally {
    User.findById = originalFindById;
  }
});
