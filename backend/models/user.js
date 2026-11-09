const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["Admin", "Editor", "ContentCreator", "Reader"],
      default: "Reader",
    },

    editorApplicationStatus: {
      type: String,
      enum: ["NotRequested", "Pending", "Approved", "Rejected"],
      default: "NotRequested",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    interests: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);