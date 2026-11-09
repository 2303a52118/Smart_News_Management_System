require("dotenv").config({ quiet: true });

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { unlink, rmdir } = require("node:fs/promises");
const { createServer } = require("node:http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const net = require("node:net");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { app } = require("../server");
const Article = require("../models/article");
const Comment = require("../models/comment");
const ReaderInteraction = require("../models/readerinteraction");
const User = require("../models/user");
const Category = require("../models/category");
const { UPLOAD_DIRECTORY } = require("../services/imageStorageService");

const baseUri = process.env.MONGO_URI;
const runId = `${process.pid}_${Date.now()}`;
let server;
let mlProcess;
let originalMlServiceUrl;
let baseUrl;
let connected = false;
let creator;
let editor;
let reader;
let admin;
let creatorToken;
let editorToken;
let readerToken;
let adminToken;
let articleIds;
const uploadedImageUrls = [];

const makeTestUri = (uri) => {
  if (!uri) {
    throw new Error("MONGO_URI is required to run article integration tests");
  }

  const parsed = new URL(uri);
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(
      "Integration tests only run against a loopback MongoDB host"
    );
  }

  parsed.pathname = `/smart_news_platform_test_${runId}`;
  return parsed.toString();
};

const authorization = (token) => ({ Authorization: `Bearer ${token}` });

const getAvailablePort = async () => {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
};

const startMlService = async () => {
  const port = await getAvailablePort();
  const serviceUrl = `http://127.0.0.1:${port}`;
  let output = "";
  let processError;
  mlProcess = spawn(
    process.env.PYTHON || "python",
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: path.resolve(__dirname, "..", "..", "ml-service"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  mlProcess.stdout.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  mlProcess.stderr.on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  });
  mlProcess.on("error", (error) => {
    processError = error;
  });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (processError || mlProcess.exitCode !== null) {
      throw new Error(
        `ML service exited before becoming ready: ${processError?.message || mlProcess.exitCode}\n${output}`
      );
    }

    try {
      const response = await fetch(`${serviceUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        originalMlServiceUrl = process.env.ML_SERVICE_URL;
        process.env.ML_SERVICE_URL = serviceUrl;
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  mlProcess.kill();
  throw new Error(`ML service did not become ready within 30 seconds\n${output}`);
};

const stopMlService = async () => {
  if (mlProcess && mlProcess.exitCode === null) {
    const exited = new Promise((resolve) => mlProcess.once("exit", resolve));
    mlProcess.kill();
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }

  if (originalMlServiceUrl === undefined) {
    delete process.env.ML_SERVICE_URL;
  } else {
    process.env.ML_SERVICE_URL = originalMlServiceUrl;
  }
};

const requestJson = async (path, { token, readingSessionId, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? authorization(token) : {}),
      ...(readingSessionId
        ? { "X-Reading-Session-Id": readingSessionId }
        : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  return { response, body };
};

const requestImage = async (url, token, image) => {
  const form = new FormData();
  form.append(
    "image",
    new Blob([image.bytes], { type: image.mimeType }),
    image.filename
  );
  const response = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: token ? authorization(token) : {},
    body: form,
  });
  return { response, body: await response.json() };
};

before(async () => {
  await startMlService();
  await mongoose.connect(makeTestUri(baseUri), {
    serverSelectionTimeoutMS: 5000,
  });
  connected = true;
  await Promise.all([ReaderInteraction.init(), Comment.init()]);

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const password = await bcrypt.hash("integration-test-password", 4);
  [creator, editor, reader, admin] = await User.create([
    {
      name: "Integration Creator",
      email: `creator-${runId}@example.test`,
      password,
      role: "ContentCreator",
      isActive: true,
    },
    {
      name: "Integration Editor",
      email: `editor-${runId}@example.test`,
      password,
      role: "Editor",
      isActive: true,
    },
    {
      name: "Integration Reader",
      email: `reader-${runId}@example.test`,
      password,
      role: "Reader",
      isActive: true,
    },
    {
      name: "Integration Admin",
      email: `admin-${runId}@example.test`,
      password,
      role: "Admin",
      isActive: true,
    },
  ]);
  creatorToken = jwt.sign(
    { id: creator._id, role: creator.role },
    process.env.JWT_SECRET
  );
  editorToken = jwt.sign(
    { id: editor._id, role: editor.role },
    process.env.JWT_SECRET
  );
  readerToken = jwt.sign(
    { id: reader._id, role: reader.role },
    process.env.JWT_SECRET
  );
  adminToken = jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_SECRET
  );

  const articles = await Article.create([
    {
      title: "Climate adaptation research",
      summary: "Climate work for resilient cities",
      content: "Research full text",
      category: "Science",
      tags: ["Climate", "Research"],
      author: creator._id,
      status: "Published",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      title: "Climate draft should stay private",
      summary: "Unpublished summary",
      content: "Unpublished full text",
      category: "Science",
      tags: ["Climate"],
      author: creator._id,
      status: "Draft",
    },
    {
      title: "Pending review article",
      summary: "Waiting for review",
      content: "Review this article",
      category: "Technology",
      tags: ["Review"],
      author: creator._id,
      status: "Pending",
    },
    {
      title: "Pending rejection article",
      summary: "Needs editorial changes",
      content: "Needs sources",
      category: "World",
      tags: ["Review"],
      author: creator._id,
      status: "Pending",
    },
    {
      title: "Previously rejected article",
      summary: "Old rejection",
      content: "Needs new draft",
      category: "World",
      tags: ["Draft"],
      author: creator._id,
      status: "Rejected",
      rejectionReason: "Add sources",
    },
  ]);
  articleIds = Object.fromEntries(
    articles.map((article) => [article.title, article._id.toString()])
  );
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (connected) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  for (const imageUrl of uploadedImageUrls) {
    const match = /^\/uploads\/(articles|categories)\/([0-9a-f-]+\.(?:jpg|jpeg|png|webp))$/i.exec(
      imageUrl
    );
    if (match) {
      await unlink(path.join(UPLOAD_DIRECTORY, match[1], match[2])).catch(
        (error) => {
          if (error.code !== "ENOENT") throw error;
        }
      );
    }
  }
  await Promise.all(
    ["articles", "categories"].map((directory) =>
      rmdir(path.join(UPLOAD_DIRECTORY, directory)).catch((error) => {
        if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
      })
    )
  );
  await rmdir(UPLOAD_DIRECTORY).catch((error) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
  });
  await stopMlService();
});

test("authenticated account profiles are private, editable, and preserve role and interests", async () => {
  const accounts = [
    { user: creator, token: creatorToken, role: "ContentCreator" },
    { user: editor, token: editorToken, role: "Editor" },
    { user: reader, token: readerToken, role: "Reader" },
    { user: admin, token: adminToken, role: "Admin" },
  ];

  const unauthenticated = await requestJson("/api/account/profile");
  assert.equal(unauthenticated.response.status, 401);

  for (const account of accounts) {
    const result = await requestJson("/api/account/profile", {
      token: account.token,
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.user.id, account.user._id.toString());
    assert.equal(result.body.user.role, account.role);
    assert.equal(result.body.user.isActive, true);
    assert.equal("password" in result.body.user, false);
    assert.equal("token" in result.body, false);

    const updated = await requestJson("/api/account/profile", {
      method: "PUT",
      token: account.token,
      body: JSON.stringify({ name: `${account.user.name} Updated` }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.user.name, `${account.user.name} Updated`);
    assert.equal(updated.body.user.role, account.role);
    assert.equal(updated.body.user.isActive, true);
  }

  const savedInterests = await requestJson("/api/readers/me/interests", {
    method: "PUT",
    token: readerToken,
    body: JSON.stringify({ interests: ["Science", "Local news"] }),
  });
  assert.equal(savedInterests.response.status, 200);

  const duplicateEmail = await requestJson("/api/account/profile", {
    method: "PUT",
    token: creatorToken,
    body: JSON.stringify({ email: reader.email }),
  });
  assert.equal(duplicateEmail.response.status, 409);

  const invalidEmail = await requestJson("/api/account/profile", {
    method: "PUT",
    token: creatorToken,
    body: JSON.stringify({ email: "not-an-email" }),
  });
  assert.equal(invalidEmail.response.status, 400);

  const forbiddenFields = await requestJson("/api/account/profile", {
    method: "PUT",
    token: creatorToken,
    body: JSON.stringify({
      name: "Escalation attempt",
      role: "Admin",
      isActive: false,
      userId: reader._id.toString(),
    }),
  });
  assert.equal(forbiddenFields.response.status, 400);
  const persistedCreator = await User.findById(creator._id);
  assert.equal(persistedCreator.role, "ContentCreator");
  assert.equal(persistedCreator.isActive, true);

  const incorrectPassword = await requestJson("/api/account/password", {
    method: "PATCH",
    token: readerToken,
    body: JSON.stringify({
      currentPassword: "wrong-password",
      newPassword: "new-reader-password",
    }),
  });
  assert.equal(incorrectPassword.response.status, 401);

  const shortPassword = await requestJson("/api/account/password", {
    method: "PATCH",
    token: readerToken,
    body: JSON.stringify({
      currentPassword: "integration-test-password",
      newPassword: "short",
    }),
  });
  assert.equal(shortPassword.response.status, 400);

  const passwordUpdated = await requestJson("/api/account/password", {
    method: "PATCH",
    token: readerToken,
    body: JSON.stringify({
      currentPassword: "integration-test-password",
      newPassword: "new-reader-password",
    }),
  });
  assert.equal(passwordUpdated.response.status, 200);
  assert.equal("password" in passwordUpdated.body, false);

  const readerEmail = `reader-updated-${runId}@example.test`;
  const emailUpdated = await requestJson("/api/account/profile", {
    method: "PUT",
    token: readerToken,
    body: JSON.stringify({ email: readerEmail }),
  });
  assert.equal(emailUpdated.response.status, 200);
  assert.equal(emailUpdated.body.user.email, readerEmail);
  assert.deepEqual(emailUpdated.body.user.interests, ["Science", "Local news"]);

  const relogin = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: readerEmail,
      password: "new-reader-password",
    }),
  });
  assert.equal(relogin.response.status, 200);
  assert.equal(relogin.body.user.email, readerEmail);
  assert.equal("password" in relogin.body.user, false);

  const oldPasswordRejected = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: readerEmail,
      password: "integration-test-password",
    }),
  });
  assert.equal(oldPasswordRejected.response.status, 401);
});

test("Admin creates all account roles and only Admin can use the user-management API", async () => {
  const deniedReader = await requestJson("/api/admin/users", {
    token: readerToken,
  });
  assert.equal(deniedReader.response.status, 403);

  const deniedCreation = await requestJson("/api/admin/users", {
    method: "POST",
    token: readerToken,
    body: JSON.stringify({
      name: "Unauthorized Editor",
      email: `unauthorized-${runId}@example.test`,
      password: "temporary-password-123",
      role: "Editor",
    }),
  });
  assert.equal(deniedCreation.response.status, 403);

  for (const role of ["Editor", "ContentCreator", "Reader"]) {
    const email = `${role.toLowerCase()}-managed-${runId}@example.test`;
    const created = await requestJson("/api/admin/users", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({
        name: `Managed ${role}`,
        email,
        password: "temporary-password-123",
        role,
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.user.role, role);
    assert.equal("password" in created.body.user, false);

    const login = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "temporary-password-123" }),
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.role, role);

    const userList = await requestJson("/api/admin/users", {
      token: adminToken,
    });
    assert.equal(userList.response.status, 200);
    assert.ok(userList.body.some((user) => user.email === email));

    const duplicate = await requestJson("/api/admin/users", {
      method: "POST",
      token: adminToken,
      body: JSON.stringify({
        name: `Managed ${role}`,
        email,
        password: "temporary-password-123",
        role,
      }),
    });
    assert.equal(duplicate.response.status, 409);
  }

  const adminEmail = `admin-managed-${runId}@example.test`;
  const createAdmin = await requestJson("/api/admin/users", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      name: "Managed Admin",
      email: adminEmail,
      password: "temporary-password-123",
      role: "Admin",
    }),
  });
  assert.equal(createAdmin.response.status, 201);
  const adminLogin = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: adminEmail,
      password: "temporary-password-123",
    }),
  });
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.user.role, "Admin");
});

test("public role requests keep Editor applicants reader-only until Admin approval", async () => {
  const creatorEmail = `public-creator-${runId}@example.test`;
  const creatorRegistration = await requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Public Creator",
      email: creatorEmail,
      password: "creator-password-123",
      role: "ContentCreator",
    }),
  });
  assert.equal(creatorRegistration.response.status, 201);
  assert.equal(creatorRegistration.body.user.role, "ContentCreator");
  assert.equal(creatorRegistration.body.user.editorApplicationStatus, "NotRequested");

  const creatorArticle = await requestJson("/api/articles", {
    method: "POST",
    token: creatorRegistration.body.token,
    body: JSON.stringify({
      title: "Live event report",
      summary: "A report with event context",
      description: "Additional context for this live news report.",
      content: "Reporting details from the event.",
      category: "World",
      tags: ["live", "reporting"],
      sourceName: "Example News",
      sourceUrl: "https://example.test/live-event",
      eventDate: "2026-03-01T10:30:00.000Z",
    }),
  });
  assert.equal(creatorArticle.response.status, 201);
  assert.equal(creatorArticle.body.article.status, "Draft");
  assert.equal(creatorArticle.body.article.description, "Additional context for this live news report.");
  assert.equal(creatorArticle.body.article.sourceName, "Example News");
  assert.equal(
    new Date(creatorArticle.body.article.eventDate).toISOString(),
    "2026-03-01T10:30:00.000Z"
  );
  const submittedArticle = await requestJson(
    `/api/articles/${creatorArticle.body.article._id}/submit`,
    { method: "PATCH", token: creatorRegistration.body.token }
  );
  assert.equal(submittedArticle.response.status, 200);
  assert.equal(submittedArticle.body.article.status, "Pending");
  await Article.deleteOne({ _id: creatorArticle.body.article._id });

  const editorEmail = `public-editor-${runId}@example.test`;
  const editorRegistration = await requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Editor Applicant",
      email: editorEmail,
      password: "editor-password-123",
      role: "Editor",
    }),
  });
  assert.equal(editorRegistration.response.status, 201);
  assert.equal(editorRegistration.body.user.role, "Reader");
  assert.equal(editorRegistration.body.user.editorApplicationStatus, "Pending");

  const adminRoleAttempt = await requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Public Admin",
      email: `public-admin-${runId}@example.test`,
      password: "admin-password-123",
      role: "Admin",
    }),
  });
  assert.equal(adminRoleAttempt.response.status, 400);

  const editorBeforeApproval = await requestJson("/api/articles/manage", {
    token: editorRegistration.body.token,
  });
  assert.equal(editorBeforeApproval.response.status, 403);
  const unauthorizedApproval = await requestJson(
    `/api/admin/users/${editorRegistration.body.user.id}/editor-application`,
    {
      method: "PATCH",
      token: readerToken,
      body: JSON.stringify({ decision: "Approved" }),
    }
  );
  assert.equal(unauthorizedApproval.response.status, 403);

  const approval = await requestJson(
    `/api/admin/users/${editorRegistration.body.user.id}/editor-application`,
    {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ decision: "Approved" }),
    }
  );
  assert.equal(approval.response.status, 200);
  assert.equal(approval.body.user.role, "Editor");
  assert.equal(approval.body.user.editorApplicationStatus, "Approved");
  const editorAfterApproval = await requestJson("/api/articles/manage", {
    token: editorRegistration.body.token,
  });
  assert.equal(editorAfterApproval.response.status, 200);

  const login = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: editorEmail,
      password: "editor-password-123",
    }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.role, "Editor");
  assert.equal(login.body.user.editorApplicationStatus, "Approved");

  const rejectedEmail = `rejected-editor-${runId}@example.test`;
  const rejectedApplication = await requestJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Rejected Applicant",
      email: rejectedEmail,
      password: "editor-password-123",
      role: "Editor",
    }),
  });
  const rejection = await requestJson(
    `/api/admin/users/${rejectedApplication.body.user.id}/editor-application`,
    {
      method: "PATCH",
      token: adminToken,
      body: JSON.stringify({ decision: "Rejected" }),
    }
  );
  assert.equal(rejection.response.status, 200);
  assert.equal(rejection.body.user.role, "Reader");
  assert.equal(rejection.body.user.editorApplicationStatus, "Rejected");
});

test("AI writing assistance is protected and uses only the configured local Ollama endpoint", async () => {
  const previousUrl = process.env.OLLAMA_BASE_URL;
  const modelOutput = {
    headline: "Suggested headline",
    summary: "Suggested summary",
    description: "Suggested description",
    rewrittenContent: "Suggested rewrite",
    category: "Science",
    tags: ["research"],
    grammarNotes: ["Clarified the sentence."],
  };
  const ollama = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ response: JSON.stringify(modelOutput) }));
  });
  ollama.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    ollama.once("listening", resolve);
    ollama.once("error", reject);
  });
  const address = ollama.address();
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${address.port}`;

  try {
    const requestBody = JSON.stringify({ content: "A draft to review." });
    const unauthenticated = await requestJson("/api/articles/ai-assist", {
      method: "POST",
      body: requestBody,
    });
    assert.equal(unauthenticated.response.status, 401);

    const readerDenied = await requestJson("/api/articles/ai-assist", {
      method: "POST",
      token: readerToken,
      body: requestBody,
    });
    assert.equal(readerDenied.response.status, 403);

    const countBefore = await Article.countDocuments();
    const generated = await requestJson("/api/articles/ai-assist", {
      method: "POST",
      token: creatorToken,
      body: requestBody,
    });
    assert.equal(generated.response.status, 200);
    assert.equal(generated.body.suggestions.headline, "Suggested headline");
    assert.equal(generated.body.suggestions.category, "Science");
    assert.match(generated.body.notice, /nothing is saved or published automatically/);
    assert.equal(await Article.countDocuments(), countBefore);
  } finally {
    if (previousUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousUrl;
    await new Promise((resolve, reject) => {
      ollama.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("article image uploads validate type, size, roles, serving, and persistence", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    "base64"
  );
  const jpg = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z",
    "base64"
  );
  const webp = Buffer.from(
    "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
    "base64"
  );
  const images = [
    { filename: "cover.jpg", mimeType: "image/jpeg", bytes: jpg, token: creatorToken },
    { filename: "cover.png", mimeType: "image/png", bytes: png, token: editorToken },
    { filename: "cover.webp", mimeType: "image/webp", bytes: webp, token: adminToken },
  ];
  const urls = [];

  for (const image of images) {
    const result = await requestImage("/api/articles/images", image.token, image);
    assert.equal(result.response.status, 201);
    assert.match(result.body.imageUrl, /^\/uploads\/articles\/[0-9a-f-]+\.(?:jpg|png|webp)$/i);
    uploadedImageUrls.push(result.body.imageUrl);
    urls.push(result.body.imageUrl);

    const served = await fetch(`${baseUrl}${result.body.imageUrl}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), image.mimeType);
  }

  const unauthenticated = await requestImage("/api/articles/images", null, images[0]);
  assert.equal(unauthenticated.response.status, 401);
  const readerDenied = await requestImage("/api/articles/images", readerToken, images[0]);
  assert.equal(readerDenied.response.status, 403);

  const pdf = await requestImage("/api/articles/images", creatorToken, {
    filename: "document.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7"),
  });
  assert.equal(pdf.response.status, 400);
  const spoofed = await requestImage("/api/articles/images", creatorToken, {
    filename: "spoofed.jpg",
    mimeType: "image/jpeg",
    bytes: Buffer.from("%PDF-1.7"),
  });
  assert.equal(spoofed.response.status, 400);
  const tooLarge = await requestImage("/api/articles/images", creatorToken, {
    filename: "large.jpg",
    mimeType: "image/jpeg",
    bytes: Buffer.concat([jpg, Buffer.alloc(5 * 1024 * 1024)]),
  });
  assert.equal(tooLarge.response.status, 413);

  const created = await requestJson("/api/articles", {
    method: "POST",
    token: creatorToken,
    body: JSON.stringify({
      title: "Persist uploaded article image",
      summary: "Image persistence check",
      content: "Published image paths persist in MongoDB.",
      category: "Technology",
      imageUrl: urls[0],
    }),
  });
  assert.equal(created.response.status, 201);
  const articleId = created.body.article._id;
  const reloaded = await requestJson(`/api/articles/${articleId}/manage`, {
    token: creatorToken,
  });
  assert.equal(reloaded.response.status, 200);
  assert.equal(reloaded.body.imageUrl, urls[0]);

  const legacyUrl = "https://images.example.test/legacy-cover.jpg";
  const updated = await requestJson(`/api/articles/${articleId}`, {
    method: "PUT",
    token: creatorToken,
    body: JSON.stringify({ imageUrl: legacyUrl }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.article.imageUrl, legacyUrl);
});

test("category image uploads are Admin-only and persist in MongoDB", async () => {
  const image = {
    filename: "category.png",
    mimeType: "image/png",
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      "base64"
    ),
  };
  const deniedEditor = await requestImage(
    "/api/categories/images",
    editorToken,
    image
  );
  assert.equal(deniedEditor.response.status, 403);
  const deniedCreator = await requestImage(
    "/api/categories/images",
    creatorToken,
    image
  );
  assert.equal(deniedCreator.response.status, 403);
  const deniedReader = await requestImage(
    "/api/categories/images",
    readerToken,
    image
  );
  assert.equal(deniedReader.response.status, 403);
  const noToken = await requestImage("/api/categories/images", null, image);
  assert.equal(noToken.response.status, 401);

  const uploaded = await requestImage(
    "/api/categories/images",
    adminToken,
    image
  );
  assert.equal(uploaded.response.status, 201);
  uploadedImageUrls.push(uploaded.body.imageUrl);
  assert.match(uploaded.body.imageUrl, /^\/uploads\/categories\/[0-9a-f-]+\.png$/i);

  const created = await requestJson("/api/categories", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      name: `Image category ${runId}`,
      description: "Category image persistence check",
      imageUrl: uploaded.body.imageUrl,
    }),
  });
  assert.equal(created.response.status, 201);
  const stored = await Category.findById(created.body.category._id);
  assert.equal(stored.imageUrl, uploaded.body.imageUrl);
  const served = await fetch(`${baseUrl}${stored.imageUrl}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
});

test("public search, category/tag filters, and pagination use MongoDB", async () => {
  const { response, body } = await requestJson(
    "/api/articles?q=CLIMATE&category=science&tags=research&page=1&limit=1"
  );

  assert.equal(response.status, 200);
  assert.equal(body.totalArticles, 1);
  assert.equal(body.currentPage, 1);
  assert.equal(body.totalPages, 1);
  assert.equal(body.articles.length, 1);
  assert.equal(body.articles[0].status, "Published");
  assert.equal(body.articles[0].title, "Climate adaptation research");
});

test("public endpoints never disclose non-published articles", async () => {
  const list = await requestJson("/api/articles?q=should+stay+private");
  assert.equal(list.response.status, 200);
  assert.equal(list.body.totalArticles, 0);

  const details = await requestJson(
    `/api/articles/${articleIds["Climate draft should stay private"]}`
  );
  assert.equal(details.response.status, 404);
});

test("invalid query parameters and status injection return HTTP 400", async () => {
  for (const query of [
    "page=0",
    "limit=101",
    "status=Draft",
    "q=%20",
    "tags=",
  ]) {
    const { response } = await requestJson(`/api/articles?${query}`);
    assert.equal(response.status, 400, query);
  }
});

test("management filters return status counts from the database", async () => {
  const { response, body } = await requestJson(
    "/api/articles/manage?status=Pending&page=1&limit=10",
    { token: editorToken }
  );

  assert.equal(response.status, 200);
  assert.equal(body.totalArticles, 2);
  assert.ok(body.articles.every((article) => article.status === "Pending"));
});

test("creator listing is scoped to the authenticated user", async () => {
  const { response, body } = await requestJson(
    "/api/articles/mine?status=Rejected",
    { token: creatorToken }
  );

  assert.equal(response.status, 200);
  assert.equal(body.totalArticles, 1);
  assert.equal(body.articles[0].rejectionReason, "Add sources");
});

test("owner submits and Editor publishes exactly once with publishedAt set", async () => {
  const draft = await Article.create({
    title: "Integration workflow draft",
    summary: "Ready for review",
    content: "Integration workflow content",
    category: "Technology",
    author: creator._id,
    status: "Draft",
  });
  const articleId = draft._id.toString();
  const submitted = await requestJson(`/api/articles/${articleId}/submit`, {
    method: "PATCH",
    token: creatorToken,
  });
  assert.equal(submitted.response.status, 200);
  assert.equal(submitted.body.article.status, "Pending");

  const published = await requestJson(`/api/articles/${articleId}/publish`, {
    method: "PATCH",
    token: editorToken,
  });
  assert.equal(published.response.status, 200);
  assert.equal(published.body.article.status, "Published");
  assert.ok(published.body.article.publishedAt);

  const duplicate = await requestJson(`/api/articles/${articleId}/publish`, {
    method: "PATCH",
    token: editorToken,
  });
  assert.equal(duplicate.response.status, 409);
});

test("Editor rejection requires and persists a reason", async () => {
  const articleId = articleIds["Pending rejection article"];
  const missingReason = await requestJson(`/api/articles/${articleId}/reject`, {
    method: "PATCH",
    token: editorToken,
    body: JSON.stringify({}),
  });
  assert.equal(missingReason.response.status, 400);

  const rejected = await requestJson(`/api/articles/${articleId}/reject`, {
    method: "PATCH",
    token: editorToken,
    body: JSON.stringify({ reason: "  Include citations.  " }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.article.status, "Rejected");
  assert.equal(rejected.body.article.rejectionReason, "Include citations.");

  const stored = await Article.findById(articleId);
  assert.equal(stored.rejectionReason, "Include citations.");
});

test("invalid article IDs return HTTP 400", async () => {
  const { response } = await requestJson("/api/articles/not-an-object-id");
  assert.equal(response.status, 400);
});

test("creator cannot edit another user's article", async () => {
  const otherCreator = await User.create({
    name: "Other Creator",
    email: `other-${runId}@example.test`,
    password: await bcrypt.hash("integration-test-password", 4),
    role: "ContentCreator",
  });
  const otherArticle = await Article.create({
    title: "Other creator draft",
    summary: "Private summary",
    content: "Private content",
    category: "Science",
    author: otherCreator._id,
    status: "Draft",
  });

  const { response } = await requestJson(`/api/articles/${otherArticle.id}`, {
    method: "PUT",
    token: creatorToken,
    body: JSON.stringify({ title: "Unauthorized edit" }),
  });

  assert.equal(response.status, 403);
  const unchanged = await Article.findById(otherArticle._id);
  assert.equal(unchanged.title, "Other creator draft");
});

test("like and unlike are idempotent and preserve one reader/article record", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const firstLike = await requestJson(`/api/articles/${articleId}/like`, {
    method: "PUT",
    token: readerToken,
  });
  const repeatedLike = await requestJson(`/api/articles/${articleId}/like`, {
    method: "PUT",
    token: readerToken,
  });
  assert.equal(firstLike.response.status, 200);
  assert.equal(repeatedLike.response.status, 200);
  assert.equal(
    await ReaderInteraction.countDocuments({
      user: reader._id,
      article: articleId,
    }),
    1
  );
  assert.equal((await Article.findById(articleId)).likes, 1);
  await assert.rejects(
    ReaderInteraction.create({
      user: reader._id,
      article: articleId,
    }),
    (error) => error.code === 11000
  );

  const unlike = await requestJson(`/api/articles/${articleId}/like`, {
    method: "DELETE",
    token: readerToken,
  });
  assert.equal(unlike.body.liked, false);
  assert.equal((await Article.findById(articleId)).likes, 0);
});

test("bookmark and unbookmark are idempotent and saved articles are listed", async () => {
  const articleId = articleIds["Climate adaptation research"];
  await requestJson(`/api/articles/${articleId}/bookmark`, {
    method: "PUT",
    token: readerToken,
  });
  await requestJson(`/api/articles/${articleId}/bookmark`, {
    method: "PUT",
    token: readerToken,
  });

  const saved = await requestJson("/api/readers/me/bookmarks", {
    token: readerToken,
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.totalArticles, 1);
  assert.equal(saved.body.articles[0]._id, articleId);

  await requestJson(`/api/articles/${articleId}/bookmark`, {
    method: "DELETE",
    token: readerToken,
  });
  const empty = await requestJson("/api/readers/me/bookmarks", {
    token: readerToken,
  });
  assert.equal(empty.body.totalArticles, 0);
});

test("view tracking updates article totals and reader history", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const firstSessionId = randomUUID();
  const [firstView, secondView] = await Promise.all([
    requestJson(`/api/articles/${articleId}/view`, {
      method: "POST",
      token: readerToken,
      readingSessionId: firstSessionId,
    }),
    requestJson(`/api/articles/${articleId}/view`, {
      method: "POST",
      token: readerToken,
      readingSessionId: firstSessionId,
    }),
  ]);
  assert.equal(firstView.response.status, 200);
  assert.equal(secondView.response.status, 200);
  assert.equal(
    [firstView.body.counted, secondView.body.counted].filter(Boolean).length,
    1
  );
  assert.equal(firstView.body.readerViewCount, 1);
  assert.equal(secondView.body.readerViewCount, 1);
  assert.equal((await Article.findById(articleId)).views, 1);

  const secondSession = await requestJson(`/api/articles/${articleId}/view`, {
    method: "POST",
    token: readerToken,
    readingSessionId: randomUUID(),
  });
  assert.equal(secondSession.body.counted, true);
  assert.equal(secondSession.body.readerViewCount, 2);
  assert.equal((await Article.findById(articleId)).views, 2);

  const history = await requestJson("/api/readers/me/history", {
    token: readerToken,
  });
  assert.equal(history.body.totalArticles, 1);
  assert.equal(history.body.articles[0]._id, articleId);
  assert.equal(history.body.articles[0].readerViewCount, 2);
});

test("view tracking requires a valid reading session UUID", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const missing = await requestJson(`/api/articles/${articleId}/view`, {
    method: "POST",
    token: readerToken,
  });
  assert.equal(missing.response.status, 400);

  const malformed = await requestJson(`/api/articles/${articleId}/view`, {
    method: "POST",
    token: readerToken,
    readingSessionId: "not-a-uuid",
  });
  assert.equal(malformed.response.status, 400);
});

test("reader preferences validate, normalize, and persist interests", async () => {
  const updated = await requestJson("/api/readers/me/interests", {
    method: "PUT",
    token: readerToken,
    body: JSON.stringify({ interests: [" Science ", "Technology", "Science"] }),
  });
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.body.interests, ["Science", "Technology"]);

  const fetched = await requestJson("/api/readers/me/interests", {
    token: readerToken,
  });
  assert.deepEqual(fetched.body.interests, ["Science", "Technology"]);

  const invalid = await requestJson("/api/readers/me/interests", {
    method: "PUT",
    token: readerToken,
    body: JSON.stringify({ interests: [""] }),
  });
  assert.equal(invalid.response.status, 400);
});

test("article interaction state is scoped to the signed-in Reader", async () => {
  const articleId = articleIds["Climate adaptation research"];
  await requestJson(`/api/articles/${articleId}/like`, {
    method: "PUT",
    token: readerToken,
  });
  await requestJson(`/api/articles/${articleId}/bookmark`, {
    method: "PUT",
    token: readerToken,
  });

  const readerState = await requestJson(
    `/api/reader/interactions/?articleId=${articleId}`,
    { token: readerToken }
  );
  assert.equal(readerState.response.status, 200);
  assert.deepEqual(readerState.body, { liked: true, bookmarked: true });

  const anotherReader = await User.create({
    name: "Interaction State Reader",
    email: `interaction-state-${runId}@example.test`,
    password: await bcrypt.hash("integration-test-password", 4),
    role: "Reader",
  });
  const anotherToken = jwt.sign(
    { id: anotherReader._id, role: anotherReader.role },
    process.env.JWT_SECRET
  );
  const privateState = await requestJson(
    `/api/reader/interactions/?articleId=${articleId}`,
    { token: anotherToken }
  );
  assert.equal(privateState.response.status, 200);
  assert.deepEqual(privateState.body, { liked: false, bookmarked: false });

  const invalid = await requestJson(
    "/api/reader/interactions/?articleId=not-an-id",
    {
      token: readerToken,
    }
  );
  assert.equal(invalid.response.status, 400);

  const missingId = await requestJson("/api/reader/interactions/", {
    token: readerToken,
  });
  assert.equal(missingId.response.status, 400);

  const unauthorized = await requestJson(
    `/api/reader/interactions/?articleId=${articleId}`
  );
  assert.equal(unauthorized.response.status, 401);
});

test("authenticated recommendations use reader interests, likes, and TF-IDF", async () => {
  const liked = await Article.create({
    title: "Astronomy telescope observes distant galaxies",
    summary: "Astronomers study distant galaxies with a space telescope",
    content: "Research explores astronomy, stars, galaxies, and space science.",
    category: "Science",
    tags: ["astronomy", "space"],
    author: creator._id,
    status: "Published",
    publishedAt: new Date(),
  });
  const related = await Article.create({
    title: "New astronomy discoveries reveal distant galaxies",
    summary: "A space telescope reveals new galaxy formations",
    content: "Astronomy researchers find stars in distant galaxies.",
    category: "Science",
    tags: ["astronomy", "galaxies"],
    author: creator._id,
    status: "Published",
    publishedAt: new Date(),
  });
  const unrelated = await Article.create({
    title: "Local football league final",
    summary: "A sports team wins the weekend match",
    content: "Fans watched football and celebrated the league.",
    category: "Sports",
    tags: ["football"],
    author: creator._id,
    status: "Published",
    views: 10,
    likes: 1,
    publishedAt: new Date(),
  });
  const privateArticle = await Article.create({
    title: "Astronomy draft must not be recommended",
    summary: "Draft space article",
    content: "Astronomy stars and galaxies",
    category: "Science",
    author: creator._id,
    status: "Draft",
  });

  await requestJson("/api/readers/me/interests", {
    method: "PUT",
    token: readerToken,
    body: JSON.stringify({ interests: ["astronomy", "space"] }),
  });
  await requestJson(`/api/articles/${liked.id}/like`, {
    method: "PUT",
    token: readerToken,
  });

  const denied = await requestJson("/api/recommendations", {
    token: editorToken,
  });
  assert.equal(denied.response.status, 403);

  const result = await requestJson("/api/recommendations?limit=5", {
    token: readerToken,
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.fallback, false);
  assert.ok(result.body.recommendations.length > 0);
  assert.equal(result.body.recommendations[0].article_id, related.id);
  assert.ok(
    result.body.recommendations.every(
      (item) =>
        item.article_id !== liked.id &&
        item.article_id !== privateArticle.id &&
        item.article_id !== articleIds["Climate adaptation research"]
    )
  );
  assert.ok(
    result.body.recommendations.some((item) => item.article_id === unrelated.id)
  );
});

test("recommendation route returns popularity fallback when ML is down", async () => {
  const originalUrl = process.env.ML_SERVICE_URL;
  process.env.ML_SERVICE_URL = "http://127.0.0.1:1";

  try {
    const result = await requestJson("/api/recommendations?limit=3", {
      token: readerToken,
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.fallback, true);
    assert.ok(
      result.body.recommendations.every((item) =>
        item.recommendation_reason.includes("ML service unavailable")
      )
    );
    assert.ok(
      result.body.recommendations.every(
        (item) => item.article_id !== articleIds["Climate adaptation research"]
      )
    );
  } finally {
    process.env.ML_SERVICE_URL = originalUrl;
  }
});

test("admin analytics reports are populated and remain admin-only", async () => {
  const [adminResponse, deniedResponse] = await Promise.all([
    requestJson("/api/admin/reports", { token: creatorToken }),
    requestJson("/api/admin/reports", { token: editorToken }),
  ]);
  assert.equal(adminResponse.response.status, 403);
  assert.equal(deniedResponse.response.status, 403);

  const adminUser = await User.create({
    name: "Analytics Admin",
    email: `analytics-admin-${runId}@example.test`,
    password: await bcrypt.hash("integration-test-password", 4),
    role: "Admin",
  });
  const adminToken = jwt.sign(
    { id: adminUser._id, role: adminUser.role },
    process.env.JWT_SECRET
  );
  const response = await requestJson("/api/admin/reports", {
    token: adminToken,
  });
  assert.equal(response.response.status, 200);
  assert.ok(Array.isArray(response.body.categoryReport));
  assert.ok(Array.isArray(response.body.mostViewedArticles));
  assert.ok(Array.isArray(response.body.publishingActivity));
  assert.ok(Array.isArray(response.body.userRoles));
  assert.ok(response.body.engagement.activeReaders >= 1);
  assert.ok(response.body.categoryReport.some(({ category }) => category === "Science"));
});

test("one reader cannot remove another reader's bookmark", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const otherReader = await User.create({
    name: "Second Integration Reader",
    email: `second-reader-${runId}@example.test`,
    password: await bcrypt.hash("integration-test-password", 4),
    role: "Reader",
  });
  const otherToken = jwt.sign(
    { id: otherReader._id, role: otherReader.role },
    process.env.JWT_SECRET
  );

  await requestJson(`/api/articles/${articleId}/bookmark`, {
    method: "PUT",
    token: readerToken,
  });
  const attempt = await requestJson(`/api/articles/${articleId}/bookmark`, {
    method: "DELETE",
    token: otherToken,
  });
  assert.equal(attempt.response.status, 200);

  const ownInteraction = await ReaderInteraction.findOne({
    user: reader._id,
    article: articleId,
  });
  assert.equal(ownInteraction.isBookmarked, true);
});

test("unpublished and deleted articles hide reader data and allow own cleanup", async () => {
  const article = await Article.create({
    title: "Reader safety test article",
    summary: "Will become unpublished",
    content: "Test content",
    category: "Testing",
    author: creator._id,
    status: "Published",
    publishedAt: new Date(),
  });

  await requestJson(`/api/articles/${article.id}/like`, {
    method: "PUT",
    token: readerToken,
  });
  await requestJson(`/api/articles/${article.id}/bookmark`, {
    method: "PUT",
    token: readerToken,
  });
  await ReaderInteraction.updateOne(
    { user: reader._id, article: article._id },
    { $set: { viewCount: 1, lastViewedAt: new Date() } }
  );
  const comment = await Comment.create({
    article: article._id,
    author: reader._id,
    content: "Hidden when unpublished",
    status: "Approved",
  });

  await Article.updateOne(
    { _id: article._id },
    { $set: { status: "Draft" } }
  );

  const publicDetails = await requestJson(`/api/articles/${article.id}`);
  const publicComments = await requestJson(
    `/api/articles/${article.id}/comments`
  );
  const bookmarks = await requestJson("/api/readers/me/bookmarks", {
    token: readerToken,
  });
  const history = await requestJson("/api/readers/me/history", {
    token: readerToken,
  });
  assert.equal(publicDetails.response.status, 404);
  assert.equal(publicComments.response.status, 404);
  assert.ok(
    bookmarks.body.articles.every(
      (savedArticle) => savedArticle._id !== article.id
    )
  );
  assert.ok(
    history.body.articles.every(
      (historyArticle) => historyArticle._id !== article.id
    )
  );

  const unbookmark = await requestJson(
    `/api/articles/${article.id}/bookmark`,
    { method: "DELETE", token: readerToken }
  );
  const unlike = await requestJson(`/api/articles/${article.id}/like`, {
    method: "DELETE",
    token: readerToken,
  });
  assert.equal(unbookmark.response.status, 200);
  assert.equal(unlike.response.status, 200);
  const cleanedInteraction = await ReaderInteraction.findOne({
    user: reader._id,
    article: article._id,
  });
  assert.equal(cleanedInteraction.isBookmarked, false);
  assert.equal(cleanedInteraction.isLiked, false);

  await article.deleteOne();
  const deletedArticleView = await requestJson(
    `/api/articles/${article.id}/view`,
    {
      method: "POST",
      token: readerToken,
      readingSessionId: randomUUID(),
    }
  );
  assert.equal(deletedArticleView.response.status, 404);
  assert.ok(await Comment.exists({ _id: comment._id }));
});

test("comments remain hidden until approved by a moderator", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const created = await requestJson(`/api/articles/${articleId}/comments`, {
    method: "POST",
    token: readerToken,
    body: JSON.stringify({ content: "  Helpful report.  " }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.comment.status, "Pending");
  const commentId = created.body.comment._id;

  const queue = await requestJson("/api/comments/manage?status=Pending", {
    token: editorToken,
  });
  assert.equal(queue.response.status, 200);
  assert.ok(queue.body.comments.some((comment) => comment._id === commentId));

  const unauthorized = await requestJson(
    `/api/comments/${commentId}/moderate`,
    {
      method: "PATCH",
      token: readerToken,
      body: JSON.stringify({ status: "Approved" }),
    }
  );
  assert.equal(unauthorized.response.status, 403);

  const hidden = await requestJson(`/api/articles/${articleId}/comments`);
  assert.equal(hidden.response.status, 200);
  assert.equal(hidden.body.totalComments, 0);

  const approved = await requestJson(
    `/api/comments/${commentId}/moderate`,
    {
      method: "PATCH",
      token: editorToken,
      body: JSON.stringify({ status: "Approved" }),
    }
  );
  assert.equal(approved.response.status, 200);

  const visible = await requestJson(`/api/articles/${articleId}/comments`);
  assert.equal(visible.body.totalComments, 1);
  assert.equal(visible.body.comments[0].content, "Helpful report.");
});

test("a reader cannot modify or delete another reader's comment", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const ownerComment = await requestJson(
    `/api/articles/${articleId}/comments`,
    {
      method: "POST",
      token: readerToken,
      body: JSON.stringify({ content: "Comment owned by reader one." }),
    }
  );
  const commentId = ownerComment.body.comment._id;

  const otherReader = await User.create({
    name: "Comment Access Reader",
    email: `comment-access-${runId}@example.test`,
    password: await bcrypt.hash("integration-test-password", 4),
    role: "Reader",
  });
  const otherToken = jwt.sign(
    { id: otherReader._id, role: otherReader.role },
    process.env.JWT_SECRET
  );

  const edit = await requestJson(`/api/comments/${commentId}`, {
    method: "PUT",
    token: otherToken,
    body: JSON.stringify({ content: "Unauthorized edit." }),
  });
  const remove = await requestJson(`/api/comments/${commentId}`, {
    method: "DELETE",
    token: otherToken,
  });
  assert.equal(edit.response.status, 403);
  assert.equal(remove.response.status, 403);

  const unchanged = await Comment.findById(commentId);
  assert.equal(unchanged.content, "Comment owned by reader one.");
  assert.equal(unchanged.author.toString(), reader._id.toString());
});

test("comment rejection requires a reason and is not publicly visible", async () => {
  const articleId = articleIds["Climate adaptation research"];
  const created = await requestJson(`/api/articles/${articleId}/comments`, {
    method: "POST",
    token: readerToken,
    body: JSON.stringify({ content: "Needs fact checking." }),
  });
  const commentId = created.body.comment._id;

  const invalid = await requestJson(`/api/comments/${commentId}/moderate`, {
    method: "PATCH",
    token: editorToken,
    body: JSON.stringify({ status: "Rejected" }),
  });
  assert.equal(invalid.response.status, 400);

  const rejected = await requestJson(`/api/comments/${commentId}/moderate`, {
    method: "PATCH",
    token: editorToken,
    body: JSON.stringify({
      status: "Rejected",
      reason: "Please verify the claim.",
    }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.comment.moderationReason, "Please verify the claim.");

  const visible = await requestJson(`/api/articles/${articleId}/comments`);
  assert.equal(visible.body.totalComments, 1);
  assert.ok(
    visible.body.comments.every((comment) => comment.status === "Approved")
  );

  const edited = await requestJson(`/api/comments/${commentId}`, {
    method: "PUT",
    token: readerToken,
    body: JSON.stringify({ content: "Updated after rejection." }),
  });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.comment.status, "Pending");
  assert.equal(edited.body.comment.moderationReason, "");
});
