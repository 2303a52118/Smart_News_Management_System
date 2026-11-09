const { randomUUID } = require("node:crypto");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { ImageUploadError } = require("../middleware/imageUpload");

const UPLOAD_DIRECTORY = path.resolve(__dirname, "..", "uploads");

const imageFormats = [
  {
    extension: ".jpg",
    mimeType: "image/jpeg",
    matches: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    extension: ".jpeg",
    mimeType: "image/jpeg",
    matches: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    extension: ".png",
    mimeType: "image/png",
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ),
  },
  {
    extension: ".webp",
    mimeType: "image/webp",
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP",
  },
];

const validateImageFile = (file) => {
  if (!file?.buffer || typeof file.originalname !== "string") {
    throw new ImageUploadError("Choose an image file to upload.");
  }

  const extension = path.extname(file.originalname).toLowerCase();
  const format = imageFormats.find(
    (candidate) =>
      candidate.extension === extension &&
      candidate.mimeType === file.mimetype &&
      candidate.matches(file.buffer)
  );

  if (!format) {
    throw new ImageUploadError(
      "The file contents must match its JPG, JPEG, PNG, or WEBP type."
    );
  }

  return format;
};

const storeImage = async (file, collection) => {
  if (!["articles", "categories"].includes(collection)) {
    throw new Error("Invalid image collection");
  }

  const format = validateImageFile(file);
  const filename = `${randomUUID()}${format.extension}`;
  const directory = path.join(UPLOAD_DIRECTORY, collection);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, filename), file.buffer, {
    flag: "wx",
  });

  return {
    imageUrl: `/uploads/${collection}/${filename}`,
  };
};

module.exports = {
  UPLOAD_DIRECTORY,
  storeImage,
  validateImageFile,
};
