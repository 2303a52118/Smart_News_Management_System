const bcrypt = require("bcryptjs");
const User = require("../models/user");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedProfileFields = new Set(["name", "email"]);
const allowedPasswordFields = new Set(["currentPassword", "newPassword"]);

const publicProfile = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  interests: user.interests || [],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "name email role isActive interests createdAt updatedAt"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: publicProfile(user) });
  } catch (error) {
    console.error("Profile retrieval failed:", error.message);
    return res.status(500).json({ message: "Unable to load profile" });
  }
};

const updateProfile = async (req, res) => {
  const updates = req.body;
  if (
    !updates ||
    typeof updates !== "object" ||
    Array.isArray(updates) ||
    Object.keys(updates).length === 0 ||
    Object.keys(updates).some((field) => !allowedProfileFields.has(field))
  ) {
    return res.status(400).json({
      message: "Provide only a name and/or email to update",
    });
  }

  if (
    updates.name !== undefined &&
    (typeof updates.name !== "string" ||
      !updates.name.trim() ||
      updates.name.trim().length > 100)
  ) {
    return res.status(400).json({
      message: "Name must contain 1 to 100 characters",
    });
  }

  if (
    updates.email !== undefined &&
    (typeof updates.email !== "string" ||
      updates.email.trim().length > 254 ||
      !emailPattern.test(updates.email.trim()))
  ) {
    return res.status(400).json({ message: "Enter a valid email address" });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (updates.email !== undefined) {
      const email = updates.email.trim().toLowerCase();
      const duplicate = await User.exists({
        email,
        _id: { $ne: user._id },
      });
      if (duplicate) {
        return res
          .status(409)
          .json({ message: "Email address is already in use" });
      }
      user.email = email;
    }

    if (updates.name !== undefined) {
      user.name = updates.name.trim();
    }

    await user.save();
    return res.json({ message: "Profile updated", user: publicProfile(user) });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({ message: "Email address is already in use" });
    }

    console.error("Profile update failed:", error.message);
    return res.status(500).json({ message: "Unable to update profile" });
  }
};

const changePassword = async (req, res) => {
  const body = req.body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    Object.keys(body).some((field) => !allowedPasswordFields.has(field)) ||
    typeof body.currentPassword !== "string" ||
    !body.currentPassword ||
    typeof body.newPassword !== "string" ||
    body.newPassword.length < 6 ||
    Buffer.byteLength(body.newPassword, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Provide your current password and a new password of 6 to 72 bytes",
    });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentPasswordMatches = await bcrypt.compare(
      body.currentPassword,
      user.password
    );
    if (!currentPasswordMatches) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    user.password = await bcrypt.hash(body.newPassword, 12);
    await user.save();
    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Password update failed:", error.message);
    return res.status(500).json({ message: "Unable to change password" });
  }
};

module.exports = { getProfile, updateProfile, changePassword };
