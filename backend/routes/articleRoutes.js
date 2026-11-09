
const express = require("express");
const router = express.Router();

const {
  createArticle,
  getPublishedArticles,
  getArticleById,
  getAllArticles,
  getMyArticles,
  getArticleForEditing,
  updateArticle,
  submitArticle,
  publishArticle,
  rejectArticle,
  deleteArticle,
} = require("../controllers/articleController");
const {
  likeArticle,
  unlikeArticle,
  bookmarkArticle,
  unbookmarkArticle,
  recordArticleView,
  getArticleInteraction,
} = require("../controllers/readerController");
const {
  getComments,
  createComment,
} = require("../controllers/commentController");
const { createImageUploadController } = require("../controllers/imageUploadController");
const { imageUpload } = require("../middleware/imageUpload");
const { suggestWriting } = require("../controllers/writingAssistantController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Public: Readers can view published articles
router.get("/", getPublishedArticles);

router.post(
  "/images",
  protect,
  authorize("Admin", "Editor", "ContentCreator"),
  imageUpload,
  createImageUploadController("articles")
);

router.post(
  "/ai-assist",
  protect,
  authorize("Admin", "ContentCreator"),
  suggestWriting
);

// Creator: Create article
router.post(
  "/",
  protect,
  authorize("ContentCreator", "Admin"),
  createArticle
);

// Admin, Editor: View all articles
router.get(
  "/manage",
  protect,
  authorize("Admin", "Editor"),
  getAllArticles
);

// Creator, Admin: View own articles
router.get(
  "/mine",
  protect,
  authorize("ContentCreator", "Admin"),
  getMyArticles
);

router.get(
  "/:id/manage",
  protect,
  authorize("Admin", "ContentCreator"),
  getArticleForEditing
);

router.get("/:id/comments", getComments);
router.get(
  "/:id/interaction",
  protect,
  authorize("Reader"),
  getArticleInteraction
);
router.post(
  "/:id/comments",
  protect,
  authorize("Reader"),
  createComment
);
router.put("/:id/like", protect, authorize("Reader"), likeArticle);
router.delete("/:id/like", protect, authorize("Reader"), unlikeArticle);
router.put("/:id/bookmark", protect, authorize("Reader"), bookmarkArticle);
router.delete("/:id/bookmark", protect, authorize("Reader"), unbookmarkArticle);
router.post("/:id/view", protect, authorize("Reader"), recordArticleView);

// Creator: Submit article for review
router.patch(
  "/:id/submit",
  protect,
  authorize("ContentCreator", "Admin"),
  submitArticle
);

// Editor, Admin: Publish article
router.patch(
  "/:id/publish",
  protect,
  authorize("Editor", "Admin"),
  publishArticle
);

// Editor, Admin: Reject article
router.patch(
  "/:id/reject",
  protect,
  authorize("Editor", "Admin"),
  rejectArticle
);

// Creator, Admin: Update article
router.put(
  "/:id",
  protect,
  authorize("ContentCreator", "Admin"),
  updateArticle
);

// Creator, Admin: Delete article
router.delete(
  "/:id",
  protect,
  authorize("ContentCreator", "Admin"),
  deleteArticle
);

// Public: Only published article details are available
router.get("/:id", getArticleById);

module.exports = router;
