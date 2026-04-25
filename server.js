/*
  VisionForge AI - Backend

  Features:
  - Express server
  - Gemini image analysis
  - Google Datastore logs
  - Simple user accounts
  - Login sessions
  - User-specific saved logs

  Note:
  This is a class-project authentication system.
  Passwords are hashed, but for a real production app, Firebase Auth or another managed auth provider would be better.
*/

const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Datastore } = require("@google-cloud/datastore");

const app = express();
const PORT = process.env.PORT || 8080;

const PROJECT_ID = "friendly-eats-mustafa-492919";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

const datastore = new Datastore({ projectId: PROJECT_ID });

const LOG_KIND = "VisionForgeAnalysisLog";
const USER_KIND = "VisionForgeUser";
const SESSION_KIND = "VisionForgeSession";

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
  if (!text || text.trim().length < 80) return true;

  const cleaned = text.trim();
  const lastChar = cleaned[cleaned.length - 1];

  if (![".", "!", "?"].includes(lastChar)) return true;

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
  return retryResponse.text().trim();
}

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function getUserByLogin(login) {
  const normalizedLogin = normalizeLogin(login);
  const key = datastore.key([USER_KIND, normalizedLogin]);
  const [user] = await datastore.get(key);
  return user || null;
}

async function getSessionUser(sessionToken) {
  if (!sessionToken) return null;

  const key = datastore.key([SESSION_KIND, sessionToken]);
  const [session] = await datastore.get(key);

  if (!session) return null;

  const user = await getUserByLogin(session.login);
  return user || null;
}

function publicUser(user) {
  return {
    login: user.login,
    name: user.name,
    email: user.email
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "VisionForge AI",
    geminiConfigured: Boolean(GEMINI_API_KEY),
    geminiModel: GEMINI_MODEL,
    datastoreConfigured: true,
    logKind: LOG_KIND,
    userKind: USER_KIND,
    sessionKind: SESSION_KIND
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const login = normalizeLogin(req.body.login);
    const password = String(req.body.password || "");

    if (!name || !email || !login || !password) {
      return res.status(400).json({
        success: false,
        error: "Please complete all fields."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters."
      });
    }

    const existingUser = await getUserByLogin(login);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "That login is already taken."
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const userData = {
      login,
      name,
      email,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    await datastore.save({
      key: datastore.key([USER_KIND, login]),
      data: userData
    });

    const sessionToken = createSessionToken();

    await datastore.save({
      key: datastore.key([SESSION_KIND, sessionToken]),
      data: {
        token: sessionToken,
        login,
        createdAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      user: publicUser(userData),
      sessionToken
    });
  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      success: false,
      error: "Could not create account."
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const login = normalizeLogin(req.body.login);
    const password = String(req.body.password || "");

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        error: "Enter your login and password."
      });
    }

    const user = await getUserByLogin(login);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "No account found with that login."
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        error: "Incorrect password."
      });
    }

    const sessionToken = createSessionToken();

    await datastore.save({
      key: datastore.key([SESSION_KIND, sessionToken]),
      data: {
        token: sessionToken,
        login,
        createdAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      user: publicUser(user),
      sessionToken
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      error: "Could not sign in."
    });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const sessionToken = req.body.sessionToken;

    if (sessionToken) {
      await datastore.delete(datastore.key([SESSION_KIND, sessionToken]));
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error("Logout error:", error);

    res.status(500).json({
      success: false,
      error: "Could not sign out."
    });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const sessionToken = req.query.sessionToken;
    const user = await getSessionUser(sessionToken);

    if (!user) {
      return res.json({
        success: true,
        user: null
      });
    }

    res.json({
      success: true,
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Auth me error:", error);

    res.status(500).json({
      success: false,
      error: "Could not check session."
    });
  }
});

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    console.log("API CALL: /api/analyze");

    const question =
      req.body.question || "What is in front of me, and how should I move safely?";

    const sessionToken = req.body.sessionToken || "";
    const user = await getSessionUser(sessionToken);

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
    console.log("User:", user ? user.login : "guest");

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

    const description = await generateAccessibilityDescription(model, prompt, imagePart);

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
      modelUsed: GEMINI_MODEL,
      userLogin: user ? user.login : "guest",
      userName: user ? user.name : "Guest User"
    };

    await datastore.save({
      key: datastore.key(LOG_KIND),
      data: logData
    });

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

    const sessionToken = req.query.sessionToken || "";
    const user = await getSessionUser(sessionToken);

    let query = datastore
      .createQuery(LOG_KIND)
      .order("timestamp", { descending: true });

    const [allLogs] = await datastore.runQuery(query);

    let logs = allLogs;

    if (user) {
      logs = allLogs.filter((log) => log.userLogin === user.login);
    }

    res.json({
      success: true,
      user: user ? publicUser(user) : null,
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
});