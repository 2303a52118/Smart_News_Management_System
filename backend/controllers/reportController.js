const Article = require("../models/article");
const Comment = require("../models/comment");
const ReaderInteraction = require("../models/readerinteraction");
const User = require("../models/user");

const getReports = async (_req, res) => {
  try {
    const activityStart = new Date();
    activityStart.setMonth(activityStart.getMonth() - 5, 1);
    activityStart.setHours(0, 0, 0, 0);

    const [
      categoryReport,
      mostViewedArticles,
      publishingActivity,
      articleTotals,
      commentStatuses,
      userRoles,
      activeReaderIds,
      bookmarks,
    ] = await Promise.all([
      Article.aggregate([
        { $match: { status: "Published" } },
        {
          $group: {
            _id: "$category",
            articles: { $sum: 1 },
            views: { $sum: "$views" },
            likes: { $sum: "$likes" },
          },
        },
        { $sort: { articles: -1, _id: 1 } },
        { $project: { _id: 0, category: "$_id", articles: 1, views: 1, likes: 1 } },
      ]),
      Article.find({ status: "Published" })
        .select("title category views likes publishedAt")
        .sort({ views: -1, publishedAt: -1 })
        .limit(10)
        .lean(),
      Article.aggregate([
        {
          $match: {
            status: "Published",
            publishedAt: { $gte: activityStart, $ne: null },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$publishedAt" } },
            published: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: "$_id", published: 1 } },
      ]),
      Article.aggregate([
        { $match: { status: "Published" } },
        {
          $group: {
            _id: null,
            articles: { $sum: 1 },
            views: { $sum: "$views" },
            likes: { $sum: "$likes" },
          },
        },
        { $project: { _id: 0, articles: 1, views: 1, likes: 1 } },
      ]),
      Comment.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $project: { _id: 0, status: "$_id", count: 1 } },
      ]),
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
        { $project: { _id: 0, role: "$_id", count: 1 } },
      ]),
      ReaderInteraction.distinct("user", {
        $or: [
          { viewCount: { $gt: 0 } },
          { isLiked: true },
          { isBookmarked: true },
        ],
      }),
      ReaderInteraction.countDocuments({ isBookmarked: true }),
    ]);

    const commentsByStatus = Object.fromEntries(
      commentStatuses.map(({ status, count }) => [status, count])
    );
    const total = articleTotals[0] || { articles: 0, views: 0, likes: 0 };

    return res.json({
      categoryReport,
      mostViewedArticles,
      publishingActivity,
      userRoles,
      engagement: {
        ...total,
        activeReaders: activeReaderIds.length,
        bookmarks,
        comments: Object.values(commentsByStatus).reduce(
          (sum, count) => sum + count,
          0
        ),
        approvedComments: commentsByStatus.Approved || 0,
        pendingComments: commentsByStatus.Pending || 0,
      },
    });
  } catch (error) {
    console.error("Analytics report generation failed:", error.message);
    return res.status(500).json({ message: "Unable to generate analytics reports" });
  }
};

module.exports = { getReports };
