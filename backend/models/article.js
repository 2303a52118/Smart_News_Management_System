
const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    summary: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
      maxlength: 500,
    },

    content: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      required: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    imageUrl: {
      type: String,
      default: "",
    },

    sourceName: {
      type: String,
      default: "",
      maxlength: 150,
    },

    sourceUrl: {
      type: String,
      default: "",
      maxlength: 2048,
    },

    eventDate: {
      type: Date,
      default: null,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["Draft", "Pending", "Published", "Rejected"],
      default: "Draft",
    },

    views: {
      type: Number,
      default: 0,
    },

    likes: {
      type: Number,
      default: 0,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.index({ author: 1, status: 1, createdAt: -1 });
articleSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model("Article", articleSchema);
