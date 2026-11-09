
const express = require("express");
const router = express.Router();

const {
  createCategory,
  getCategories,
  getAllCategories,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");

const { protect, authorize } = require("../middleware/authMiddleware");
const { createImageUploadController } = require("../controllers/imageUploadController");
const { imageUpload } = require("../middleware/imageUpload");

router.get("/", getCategories);

router.get(
  "/manage",
  protect,
  authorize("Admin"),
  getAllCategories
);

router.post(
  "/images",
  protect,
  authorize("Admin"),
  imageUpload,
  createImageUploadController("categories")
);

router.post(
  "/",
  protect,
  authorize("Admin"),
  createCategory
);

router.patch(
  "/:id",
  protect,
  authorize("Admin"),
  updateCategory
);

router.delete(
  "/:id",
  protect,
  authorize("Admin"),
  deleteCategory
);

module.exports = router;
