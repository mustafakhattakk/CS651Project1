/*
  VisionForge AI - Project 2 Backend

  Uses:
  - Node.js + Express
  - Gemini API
  - Google Datastore

  This version improves:
  - richer accessibility guidance
  - less robotic responses
  - longer output space
  - automatic retry if Gemini returns an incomplete response
*/

const express = require("express");
const path = require("path");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Datastore } = require("@google-cloud/datastore");

const app = express();
const PORT = process.env.PORT || 8080;

const PROJECT_ID = "friendly-eats-mustafa-492919";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/*
  Using Gemini 2.0 Flash here because it is stable, fast, multimodal,
  and less likely to cut off short responses compared with thinking-heavy models.
*/
const GEMINI_MODEL = "gemini-2.5-flash";

const datastore = new Datastore({ projectId: PROJECT_ID });
const DATASTORE_KIND = "VisionForgeAnalysisLog";

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

function imageToGeminiPart(file) {
  return {
    inlineData: {
      data: file.buffer.toString("base64"),
      mimeType: file.mimetype
    }
  };
}

function buildAccessibilityPrompt(userQuestion) {
  return `
You are VisionForge AI, a live visual guidance assistant for a blind or visually impaired person.

The user may physically move based on your answer. Your answer must help them decide what to do next safely.

User question:
"${userQuestion}"

Do not give a generic image caption.
Do not just identify objects.
Do not say only "safe" or "unsafe."
Do not stop after one sentence.
Do not use markdown, headings, bullet points, or numbered lists.
Do not say "the image shows."

Write one natural paragraph, around 120 to 180 words.

Your paragraph must include:
1. A clear safety judgment first.
2. What is directly ahead of the user.
3. The walking surface or path condition.
4. The safest direction to move, if visible.
5. Approximate distance language such as "nearby," "a few steps ahead," "farther ahead," or "close to your right."
6. A practical next action for the next few seconds.
7. A warning about the biggest visible hazard.

If the image is unclear, say that and advise the user to pause.

Example style:
"It does not look fully safe to walk straight ahead because the ground is uneven and the water is close on your right. Directly ahead, the path appears to continue over loose stones, which can shift under your feet. The safer movement is to stay slightly left, away from the wet edge, and take small slow steps. A few steps ahead, the surface still looks unstable, so do not rush or turn sharply. Pause if your footing feels loose, then continue only if the ground feels steady."

Now give the best guidance for this image.
`;
}

function looksIncomplete(text) {
  if (!text || text.trim().length < 80) {
    return true;
  }

  const cleaned = text.trim();
  const lastChar = cleaned[cleaned.length - 1];

  if (![".", "!", "?"].includes(lastChar)) {
    return true;
  }

  const badEndings = [
    "you are currently",
    "because",
    "and",
    "but",
    "with",
    "near",
    "towards",
    "toward",
    "currently"
  ];

  const lower = cleaned.toLowerCase();

  return badEndings.some((ending) => lower.endsWith(ending));
}

async function generateAccessibilityDescription(model, prompt, imagePart) {
  const firstResult = await model.generateContent([prompt, imagePart]);
  const firstResponse = await firstResult.response;
  let description = firstResponse.text().trim();

  if (!looksIncomplete(description)) {
    return description;
  }

  console.log("Gemini response looked incomplete. Retrying once...");

  const retryPrompt = `
The previous answer was too short or incomplete.

Rewrite the answer as one complete natural paragraph for a blind or visually impaired user.
It must be practical and actionable.
Include safety judgment, immediate path, surface condition, safest direction, approximate distance, next physical action, and main hazard.
Do not use headings, bullets, markdown, or numbered sections.
Keep it between 120 and 180 words.
Finish the paragraph completely.
`;

  const retryResult = await model.generateContent([prompt, retryPrompt, imagePart]);
  const retryResponse = await retryResult.response;
  description = retryResponse.text().trim();

  return description;
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "VisionForge AI",
    geminiConfigured: Boolean(GEMINI_API_KEY),
    geminiModel: GEMINI_MODEL,
    datastoreConfigured: true,
    datastoreKind: DATASTORE_KIND
  });
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    console.log("API CALL: /api/analyze");

    const question =
      req.body.question || "What is in front of me, and how should I move safely?";

    if (!GEMINI_API_KEY || !genAI) {
      return res.status(500).json({
        success: false,
        error: "Gemini API key is missing."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image uploaded."
      });
    }

    console.log("Question:", question);
    console.log("Image received:", req.file.originalname);

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1200
      }
    });

    const prompt = buildAccessibilityPrompt(question);
    const imagePart = imageToGeminiPart(req.file);

    console.log("Sending request to Gemini...");

    const description = await generateAccessibilityDescription(
      model,
      prompt,
      imagePart
    );

    console.log("Gemini response received.");

    const logData = {
      timestamp: new Date().toISOString(),
      inputType: "Image + Voice/Text",
      query: question,
      description,
      tags: ["Gemini", "Datastore", "Accessibility", "Navigation"],
      imageName: req.file.originalname,
      imageMimeType: req.file.mimetype,
      imageSizeBytes: req.file.size,
      modelUsed: GEMINI_MODEL
    };

    const entity = {
      key: datastore.key(DATASTORE_KIND),
      data: logData
    };

    await datastore.save(entity);

    console.log("Saved analysis to Datastore.");

    res.json({
      success: true,
      result: logData
    });
  } catch (error) {
    console.error("Analyze route error:", error);

    res.status(500).json({
      success: false,
      error:
        "The assistant could not analyze the image. Check Gemini, Datastore, permissions, or quota."
    });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    console.log("API CALL: /api/logs");

    const query = datastore
      .createQuery(DATASTORE_KIND)
      .order("timestamp", { descending: true });

    const [logs] = await datastore.runQuery(query);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error("Logs route error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to load Datastore logs."
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`VisionForge AI backend running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}`);
  console.log(`Gemini configured: ${Boolean(GEMINI_API_KEY)}`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
  console.log(`Datastore kind: ${DATASTORE_KIND}`);
});