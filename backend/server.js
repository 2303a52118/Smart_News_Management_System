
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { validateEnv } = require("./config/env");
const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const articleRoutes = require("./routes/articleRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const adminRoutes = require("./routes/adminRoutes");
const readerRoutes = require("./routes/readerRoutes");
const commentRoutes = require("./routes/commentRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const readerInteractionRoutes = require("./routes/readerInteractionRoutes");
const { UPLOAD_DIRECTORY } = require("./services/imageStorageService");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  "/uploads",
  express.static(UPLOAD_DIRECTORY, {
    dotfiles: "deny",
    fallthrough: false,
    index: false,
    setHeaders: (response) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

// Authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);

// Article routes
app.use("/api/articles", articleRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/readers", readerRoutes);
app.use("/api/reader", readerInteractionRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/recommendations", recommendationRoutes);

// Test API
app.get("/", (req, res) => {
  res.send("Smart News Platform Backend is Running!");
});

const startServer = async () => {
  const { port } = validateEnv();
  await connectDB();

  return app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
