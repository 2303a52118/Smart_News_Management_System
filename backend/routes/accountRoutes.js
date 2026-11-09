const express = require("express");
const {
  getProfile,
  updateProfile,
  changePassword,
} = require("../controllers/accountController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.patch("/password", changePassword);

module.exports = router;
