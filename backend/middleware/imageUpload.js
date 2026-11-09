const multer = require("multer");
const path = require("node:path");

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const allowedTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

class ImageUploadError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.get(extension) !== file.mimetype) {
      return callback(
        new ImageUploadError("Upload a JPG, JPEG, PNG, or WEBP image.")
      );
    }

    return callback(null, true);
  },
});

const imageUpload = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge
          ? "Image files must be 5 MB or smaller."
          : "Upload one image using the 'image' field.",
      });
    }

    return res.status(error.statusCode || 400).json({
      message: error.message || "Invalid image upload.",
    });
  });
};

module.exports = {
  MAX_IMAGE_SIZE_BYTES,
  ImageUploadError,
  imageUpload,
};
