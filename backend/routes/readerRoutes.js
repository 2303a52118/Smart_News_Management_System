const express = require("express");
const {
  getBookmarks,
  getReadingHistory,
  getInterests,
  updateInterests,
} = require("../controllers/readerController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, authorize("Reader"));
router.get("/me/bookmarks", getBookmarks);
router.get("/me/history", getReadingHistory);
router.get("/me/interests", getInterests);
router.put("/me/interests", updateInterests);

module.exports = router;
