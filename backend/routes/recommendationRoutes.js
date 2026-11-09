const express = require("express");
const { getRecommendations } = require("../controllers/recommendationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorize("Reader"), getRecommendations);

module.exports = router;
