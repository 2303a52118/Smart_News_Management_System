const { storeImage } = require("../services/imageStorageService");

const createImageUploadController = (collection) => async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Choose an image file to upload." });
  }

  try {
    return res.status(201).json(await storeImage(req.file, collection));
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }

    console.error(`${collection} image upload failed:`, error.message);
    return res.status(500).json({ message: "Unable to store uploaded image." });
  }
};

module.exports = { createImageUploadController };
