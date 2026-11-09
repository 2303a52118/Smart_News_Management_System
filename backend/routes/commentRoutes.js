const express = require("express");
const {
  getModerationQueue,
  updateComment,
  deleteComment,
  moderateComment,
} = require("../controllers/commentController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get(
  "/manage",
  protect,
  authorize("Admin", "Editor"),
  getModerationQueue
);
router.put("/:id", protect, authorize("Reader"), updateComment);
router.delete("/:id", protect, deleteComment);
router.patch(
  "/:id/moderate",
  protect,
  authorize("Admin", "Editor"),
  moderateComment
);

module.exports = router;
