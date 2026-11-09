const Category = require("../models/category");

const MAX_CONTENT_LENGTH = 50000;
const MAX_TAGS = 20;
const allowedFields = new Set([
  "title",
  "summary",
  "description",
  "content",
  "category",
  "tags",
  "sourceName",
  "sourceUrl",
]);
const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

class WritingAssistantError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const validateDraft = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WritingAssistantError("Draft data must be a JSON object", 400);
  }

  const unexpectedField = Object.keys(body).find(
    (field) => !allowedFields.has(field)
  );
  if (unexpectedField) {
    throw new WritingAssistantError(
      `Draft field '${unexpectedField}' is not supported`,
      400
    );
  }

  if (
    typeof body.content !== "string" ||
    !body.content.trim() ||
    body.content.length > MAX_CONTENT_LENGTH
  ) {
    throw new WritingAssistantError(
      `content must contain 1-${MAX_CONTENT_LENGTH} characters`,
      400
    );
  }

  if (
    body.tags !== undefined &&
    (!Array.isArray(body.tags) ||
      body.tags.length > MAX_TAGS ||
      body.tags.some(
        (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 50
      ))
  ) {
    throw new WritingAssistantError(
      `tags must contain at most ${MAX_TAGS} non-empty strings of 50 characters or fewer`,
      400
    );
  }

  for (const [field, maximum] of [
    ["title", 200],
    ["summary", 2000],
    ["description", 500],
    ["category", 100],
    ["sourceName", 150],
    ["sourceUrl", 2048],
  ]) {
    if (
      body[field] !== undefined &&
      (typeof body[field] !== "string" || body[field].length > maximum)
    ) {
      throw new WritingAssistantError(
        `${field} must be a string of at most ${maximum} characters`,
        400
      );
    }
  }

  return {
    title: body.title?.trim() || "",
    summary: body.summary?.trim() || "",
    description: body.description?.trim() || "",
    content: body.content.trim(),
    category: body.category?.trim() || "",
    tags: body.tags || [],
    sourceName: body.sourceName?.trim() || "",
    sourceUrl: body.sourceUrl?.trim() || "",
  };
};

const validateSuggestions = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WritingAssistantError(
      "The local writing model returned an invalid suggestion response",
      502
    );
  }

  const stringFields = [
    "headline",
    "summary",
    "description",
    "rewrittenContent",
    "category",
  ];
  const suggestions = {};
  for (const field of stringFields) {
    if (typeof value[field] !== "string" || value[field].length > 100000) {
      throw new WritingAssistantError(
        "The local writing model returned an invalid suggestion response",
        502
      );
    }
    suggestions[field] = value[field].trim();
  }

  if (
    !Array.isArray(value.tags) ||
    value.tags.length > MAX_TAGS ||
    value.tags.some(
      (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 50
    ) ||
    !Array.isArray(value.grammarNotes) ||
    value.grammarNotes.length > 10 ||
    value.grammarNotes.some(
      (note) => typeof note !== "string" || !note.trim() || note.length > 300
    )
  ) {
    throw new WritingAssistantError(
      "The local writing model returned invalid tags or grammar notes",
      502
    );
  }

  suggestions.tags = [...new Set(value.tags.map((tag) => tag.trim()))];
  suggestions.grammarNotes = value.grammarNotes.map((note) => note.trim());
  return suggestions;
};

const suggestWriting = async (req, res) => {
  let draft;
  try {
    draft = validateDraft(req.body);
  } catch (error) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  let ollamaUrl;
  try {
    ollamaUrl = new URL(
      process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"
    );
  } catch {
    return res.status(500).json({ message: "Invalid local writing service URL" });
  }

  if (
    ollamaUrl.protocol !== "http:" ||
    !localHosts.has(ollamaUrl.hostname)
  ) {
    return res.status(500).json({
      message: "OLLAMA_BASE_URL must point to a local Ollama service",
    });
  }

  try {
    const categories = await Category.find({ isActive: true })
      .select("name -_id")
      .sort({ name: 1 })
      .lean();
    const categoryNames = categories.map((item) => item.name);
    const prompt = [
      "You are a careful newsroom writing assistant. Return only valid JSON with exactly these keys:",
      "headline, summary, description, rewrittenContent, category, tags, grammarNotes.",
      "Provide suggestions only. Preserve the supplied facts, attribution, uncertainty, quotes, and dates.",
      "Do not invent facts, sources, quotes, statistics, or claims. Do not publish or alter any external system.",
      "Keep description under 500 characters, tags to at most 20 short strings, and grammarNotes to at most 10 concise notes.",
      categoryNames.length
        ? `Choose category only from this active list: ${JSON.stringify(categoryNames)}. If none fits, use the current category.`
        : "Keep the current category because no active categories are available.",
      "Draft to review:",
      JSON.stringify(draft),
    ].join("\n");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    let response;
    try {
      response = await fetch(
        `${ollamaUrl.toString().replace(/\/+$/, "")}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL || "llama3.1",
            prompt,
            stream: false,
            format: "json",
            options: { temperature: 0.2 },
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("Local writing model request failed with status", response.status);
      return res.status(503).json({
        message:
          "The local writing model is unavailable or the configured model is not installed",
      });
    }

    const result = await response.json();
    if (typeof result.response !== "string") {
      throw new WritingAssistantError(
        "The local writing model returned an invalid response",
        502
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(result.response);
    } catch {
      throw new WritingAssistantError(
        "The local writing model returned invalid JSON",
        502
      );
    }

    const suggestions = validateSuggestions(parsed);
    if (suggestions.category && categoryNames.length > 0) {
      suggestions.category =
        categoryNames.find(
          (category) =>
            category.toLowerCase() === suggestions.category.toLowerCase()
        ) || draft.category;
    }

    return res.json({
      suggestions,
      notice:
        "AI suggestions are unverified. Review and apply them individually; nothing is saved or published automatically.",
    });
  } catch (error) {
    if (error instanceof WritingAssistantError) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    if (error.name === "AbortError") {
      return res.status(504).json({
        message: "The local writing model timed out. Try again with a shorter draft.",
      });
    }

    console.error("Local writing assistant failed:", error.message);
    return res.status(503).json({
      message:
        "Unable to reach the local writing model. Start Ollama and verify the configured model.",
    });
  }
};

module.exports = { suggestWriting };
