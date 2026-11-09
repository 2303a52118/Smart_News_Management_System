const test = require("node:test");
const assert = require("node:assert/strict");
const { validateImageFile } = require("../services/imageStorageService");

const imageFile = (name, mimetype, buffer) => ({
  originalname: name,
  mimetype,
  buffer,
});

test("image upload accepts matching JPEG, PNG, and WEBP file signatures", () => {
  const formats = [
    imageFile("cover.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff])),
    imageFile(
      "cover.png",
      "image/png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ),
    imageFile(
      "cover.webp",
      "image/webp",
      Buffer.from("RIFF0000WEBP", "ascii")
    ),
  ];

  assert.deepEqual(
    formats.map((file) => validateImageFile(file).mimeType),
    ["image/jpeg", "image/png", "image/webp"]
  );
});

test("image upload rejects unsupported extensions and spoofed file contents", () => {
  assert.throws(
    () => validateImageFile(imageFile("document.pdf", "application/pdf", Buffer.from("%PDF"))),
    { statusCode: 400 }
  );
  assert.throws(
    () => validateImageFile(imageFile("fake.jpg", "image/jpeg", Buffer.from("%PDF"))),
    { statusCode: 400 }
  );
  assert.throws(
    () => validateImageFile(imageFile("fake.png", "image/jpeg", Buffer.from([0x89, 0x50, 0x4e, 0x47]))),
    { statusCode: 400 }
  );
});
