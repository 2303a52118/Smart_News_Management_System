const mongoose = require("mongoose");

const readerInteractionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Article",
      required: true,
    },
    isLiked: {
      type: Boolean,
      default: false,
    },
    isBookmarked: {
      type: Boolean,
      default: false,
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastViewedAt: {
      type: Date,
      default: null,
    },
    lastViewSessionId: {
      type: String,
      default: null,
      maxlength: 64,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

readerInteractionSchema.index({ user: 1, article: 1 }, { unique: true });
readerInteractionSchema.index({ user: 1, isBookmarked: 1, updatedAt: -1 });
readerInteractionSchema.index({ user: 1, lastViewedAt: -1 });
readerInteractionSchema.index({ article: 1, isLiked: 1 });

module.exports = mongoose.model("ReaderInteraction", readerInteractionSchema);
