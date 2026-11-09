const Category = require("../models/category");
const mongoose = require("mongoose");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isDuplicateKeyError = (error) => error.code === 11000;

const createCategory = async (req, res) => {
  try {
    const { name, description = "", imageUrl = "" } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    if (typeof description !== "string" || typeof imageUrl !== "string") {
      return res.status(400).json({
        message: "Description and image URL must be strings",
      });
    }

    const normalizedName = name.trim();
    const existing = await Category.findOne({
      name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
    });

    if (existing) {
      return res.status(409).json({ message: "Category already exists" });
    }

    const category = await Category.create({
      name: normalizedName,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
    });

    return res.status(201).json({
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: "Category already exists" });
    }

    console.error("Category creation failed:", error.message);
    return res.status(500).json({ message: "Unable to create category" });
  }
};

const getCategories = async (_req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({
      name: 1,
    });

    return res.json(categories);
  } catch (error) {
    console.error("Category listing failed:", error.message);
    return res.status(500).json({ message: "Unable to list categories" });
  }
};

const getAllCategories = async (_req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    return res.json(categories);
  } catch (error) {
    console.error("Category management listing failed:", error.message);
    return res.status(500).json({ message: "Unable to list categories" });
  }
};

const updateCategory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updates = req.body || {};
    const allowedFields = ["name", "description", "imageUrl", "isActive"];
    const providedFields = allowedFields.filter(
      (field) => updates[field] !== undefined
    );

    if (providedFields.length === 0) {
      return res.status(400).json({ message: "No category fields provided" });
    }

    if (
      (updates.name !== undefined &&
        (typeof updates.name !== "string" || !updates.name.trim())) ||
      (updates.description !== undefined &&
        typeof updates.description !== "string") ||
      (updates.imageUrl !== undefined && typeof updates.imageUrl !== "string") ||
      (updates.isActive !== undefined && typeof updates.isActive !== "boolean")
    ) {
      return res.status(400).json({ message: "Invalid category field value" });
    }

    if (updates.name !== undefined) {
      const normalizedName = updates.name.trim();
      const duplicate = await Category.findOne({
        _id: { $ne: category._id },
        name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
      });

      if (duplicate) {
        return res.status(409).json({ message: "Category already exists" });
      }

      category.name = normalizedName;
    }

    for (const field of ["description", "imageUrl"]) {
      if (updates[field] !== undefined) {
        category[field] = updates[field].trim();
      }
    }

    if (updates.isActive !== undefined) {
      category.isActive = updates.isActive;
    }

    await category.save();

    return res.json({
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: "Category already exists" });
    }

    console.error("Category update failed:", error.message);
    return res.status(500).json({ message: "Unable to update category" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    category.isActive = false;
    await category.save();

    return res.json({
      message: "Category deactivated successfully",
      category,
    });
  } catch (error) {
    console.error("Category deactivation failed:", error.message);
    return res.status(500).json({ message: "Unable to deactivate category" });
  }
};

module.exports = {
  createCategory,
  getCategories,
  getAllCategories,
  updateCategory,
  deleteCategory,
};
