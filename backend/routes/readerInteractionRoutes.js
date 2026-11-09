const express = require("express");
const { getArticleInteraction } = require("../controllers/readerController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/interactions/", protect, authorize("Reader"), getArticleInteraction);

module.exports = router;
