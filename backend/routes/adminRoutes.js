const express = require("express");
const {
  createStaffUser,
  listUsers,
  reviewEditorApplication,
  updateUserRole,
  updateUserStatus,
} = require("../controllers/adminController");
const { getReports } = require("../controllers/reportController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, authorize("Admin"));
router.get("/users", listUsers);
router.get("/reports", getReports);
router.post("/users", createStaffUser);
router.patch("/users/:id/role", updateUserRole);
router.patch("/users/:id/status", updateUserStatus);
router.patch("/users/:id/editor-application", reviewEditorApplication);

module.exports = router;
