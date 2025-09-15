import express from "express";
import dotenv from "dotenv";
import { client, createCollection } from "./qdrant.js";
import { testRedis } from "./redisTest.js";
import { storeText, queryText } from "./rag.js";
import { callGemini } from "./gemini.js";
import sessionRouter from './routes/session.js';
import session from "express-session";
import connectRedis from "connect-redis";


dotenv.config();

const app = express();
const RedisStore = connectRedis(session);
app.use(express.json());
app.use('/session', sessionRouter);
const PORT = process.env.PORT || 3000;

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.connect().catch(console.error);

app.use(session({
  store: new RedisStore({client: redisClient}),
  secret: process.env.SESSION_SECRET || 'yourSecretKey',  // use env variable for security
  resave: false,        // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,  // session expiration (e.g., 24 hours)
    secure: false,  // if using HTTPS, set this true
  }
}));

// Initialize
createCollection("text_collection", { vectors: { size: 4, distance: "Cosine" } });
testRedis();

// Optional: store some initial text
storeText("Hello world");

// Routes
app.get("/hello", (req, res) => {
  res.send("Hello from backend!");
});

//fetch chat history for this session:
app.get('/session/history', (req, res) => {
  res.json({history: req.session.history || [] });
});

//Clear chat session history:
app.post('session/reset', (req, res) => {
  res.session.history = [];
  res.json({message: "Session history cleared"});
});

app.post("/ask", async (req, res) => {
  const { question } = req.body;

  // 1️⃣ Retrieve closest text from Qdrant
  const retrievedText = await queryText(question);

  if (!retrievedText) return res.json({ answer: "No matching text found" });

  // 2️⃣ Call Gemini with retrieved text
  const answer = await callGemini(`Answer this based on context: "${retrievedText}"`);

  res.json({ answer });
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
