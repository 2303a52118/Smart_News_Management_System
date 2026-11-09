const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/user");

const managedRoles = ["Admin", "Editor", "ContentCreator", "Reader"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isDuplicateKeyError = (error) => error.code === 11000;
const isSelfRequest = (req) =>
  String(req.user._id).toLowerCase() === req.params.id.toLowerCase();

const isValidUserInput = ({ name, email, password }) =>
  typeof name === "string" &&
  name.trim().length > 0 &&
  typeof email === "string" &&
  emailPattern.test(email.trim()) &&
  typeof password === "string" &&
  password.length >= 12;

const listUsers = async (_req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    return res.json(users);
  } catch (error) {
    console.error("User listing failed:", error.message);
    return res.status(500).json({ message: "Unable to list users" });
  }
};

const createStaffUser = async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!isValidUserInput({ name, email, password })) {
    return res.status(400).json({
      message: "Name, valid email and a password of at least 12 characters are required",
    });
  }

  if (!managedRoles.includes(role)) {
    return res.status(400).json({
      message: "Invalid user role",
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      editorApplicationStatus: role === "Editor" ? "Approved" : "NotRequested",
      isActive: true,
    });

    return res.status(201).json({
      message: "User account created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        editorApplicationStatus: user.editorApplicationStatus,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({ message: "Email already registered" });
    }

    console.error("User account creation failed:", error.message);
    return res.status(500).json({ message: "Unable to create user account" });
  }
};

const updateUserRole = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const { role } = req.body || {};

  if (!managedRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid user role" });
  }

  try {
    if (isSelfRequest(req)) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      user.role === "Admin" &&
      user.isActive !== false &&
      role !== "Admin"
    ) {
      const activeAdminCount = await User.countDocuments({
        role: "Admin",
        isActive: { $ne: false },
      });

      if (activeAdminCount <= 1) {
        return res.status(409).json({
          message: "The last active Admin cannot be demoted",
        });
      }
    }

    user.role = role;
    user.editorApplicationStatus =
      role === "Editor" ? "Approved" : "NotRequested";
    await user.save();

    return res.json({
      message: "User role updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        editorApplicationStatus: user.editorApplicationStatus,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("User role update failed:", error.message);
    return res.status(500).json({ message: "Unable to update user role" });
  }
};

const updateUserStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const { isActive } = req.body || {};

  if (typeof isActive !== "boolean") {
    return res.status(400).json({ message: "isActive must be a boolean" });
  }

  try {
    if (isSelfRequest(req) && !isActive) {
      return res.status(400).json({ message: "You cannot deactivate yourself" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "Admin" && user.isActive !== false && !isActive) {
      const activeAdminCount = await User.countDocuments({
        role: "Admin",
        isActive: { $ne: false },
      });

      if (activeAdminCount <= 1) {
        return res.status(409).json({
          message: "The last active Admin cannot be deactivated",
        });
      }
    }

    user.isActive = isActive;
    await user.save();

    return res.json({
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("User status update failed:", error.message);
    return res.status(500).json({ message: "Unable to update user status" });
  }
};

const reviewEditorApplication = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const { decision } = req.body || {};
  if (!["Approved", "Rejected"].includes(decision)) {
    return res.status(400).json({
      message: "decision must be Approved or Rejected",
    });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      user.role !== "Reader" ||
      user.editorApplicationStatus !== "Pending"
    ) {
      return res.status(409).json({
        message: "This user has no pending Editor application",
      });
    }

    user.editorApplicationStatus = decision;
    if (decision === "Approved") {
      user.role = "Editor";
    }
    await user.save();

    return res.json({
      message:
        decision === "Approved"
          ? "Editor application approved"
          : "Editor application rejected",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        editorApplicationStatus: user.editorApplicationStatus,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Editor application review failed:", error.message);
    return res.status(500).json({ message: "Unable to review application" });
  }
};

module.exports = {
  listUsers,
  createStaffUser,
  updateUserRole,
  updateUserStatus,
  reviewEditorApplication,
};
