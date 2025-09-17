import express from "express";
import dotenv from "dotenv";
import Redis from "ioredis";
import { QdrantClient } from "@qdrant/js-client-rest";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import newsIngestionRouter from "./routes/newsIngestion.js";
import chatRouter from "./routes/chat.js";
import { getEmbedding as getJinaEmbedding } from "./jina.js";

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Initialize WebSocket server
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Routes
app.use("/api/news", newsIngestionRouter);
app.use("/api/chat", chatRouter);

// -----------------------------
// Redis setup
// -----------------------------
export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// -----------------------------
// Qdrant setup
// -----------------------------
export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

// -----------------------------
// WebSocket connection handler
// -----------------------------
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("chat:message", async (data) => {
    try {
      const { sessionId, message } = data;
      if (!sessionId || !message) {
        return socket.emit("error", { message: "sessionId and message are required" });
      }

      // Get chat history
      const historyKey = `chat:${sessionId}`;
      let history = [];
      const historyStr = await redis.get(historyKey);
      if (historyStr) {
        history = JSON.parse(historyStr);
      } else {
        return socket.emit("error", { message: "Session not found" });
      }

      // Add user message to history
      const userMessage = { role: "user", content: message };
      const updatedHistory = [...history, userMessage];
      
      // Save user message immediately for better UX
      await redis.set(historyKey, JSON.stringify(updatedHistory), 'EX', 60 * 60 * 24);
      
      // Emit typing indicator
      socket.emit("chat:typing", { isTyping: true });

      // Process with RAG and get response
      const response = await processMessageWithRAG(message, updatedHistory);
      
      // Update history with assistant's response
      const assistantMessage = { role: "assistant", content: response };
      const finalHistory = [...updatedHistory, assistantMessage];
      
      // Save final history
      await redis.set(historyKey, JSON.stringify(finalHistory), 'EX', 60 * 60 * 24);
      
      // Send response
      socket.emit("chat:message", {
        message: response,
        history: finalHistory,
      });
      
    } catch (error) {
      console.error("WebSocket error:", error);
      socket.emit("error", { message: "Failed to process message" });
    } finally {
      socket.emit("chat:typing", { isTyping: false });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// -----------------------------
// Helper: Process message with RAG
// -----------------------------
async function processMessageWithRAG(message, history) {
  try {
    // Get embedding for the message
    const queryEmbedding = await getJinaEmbedding(message);
    if (!queryEmbedding) {
      throw new Error("Failed to generate embeddings for the message");
    }

    // Search for relevant context
    const searchResults = await qdrant.search("news_articles", {
      vector: queryEmbedding,
      limit: 3, // Get top 3 relevant articles
      with_payload: true,
    });

    // Format context for the prompt
    const context = searchResults
      .map(result => result.payload.text)
      .join("\n\n");

    // Create prompt with context and chat history
    const prompt = `You are a helpful news assistant. Use the following context to answer the question. 
If you don't know the answer, say you don't know. Be concise and accurate.

Context:
${context}

Chat History:
${history.map(msg => `${msg.role}: ${msg.content}`).join("\n")}

User: ${message}
Assistant:`;

    // Get response from Gemini
    const response = await callGemini(prompt);
    return response;
  } catch (error) {
    console.error("Error in RAG processing:", error);
    return "I'm sorry, I encountered an error processing your request. Please try again later.";
  }
}

// -----------------------------
// Helper: Call Gemini API
// -----------------------------
export async function callGemini(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to call Gemini API');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response. Please try again.";
  } catch (err) {
    console.error("Gemini API error:", err);
    return "I'm having trouble connecting to the AI service. Please try again later.";
  }
}

// -----------------------------
// Health check endpoint
// -----------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      redis: "connected",
      qdrant: "connected",
      gemini: process.env.GEMINI_API_KEY ? "configured" : "not configured"
    }
  });
});

// -----------------------------
// Error handling middleware
// -----------------------------
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// -----------------------------
// API: Test Redis
// -----------------------------
app.get("/test-redis", async (req, res) => {
  await redis.set("RAG", "Chatbot");
  const value = await redis.get("RAG");
  res.json({ redis: value });
});

// -----------------------------
// API: Ask a question (RAG pipeline)
// -----------------------------
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "Question required" });

    // 1. Get embedding of the question
    const embedding = await getJinaEmbedding(question);
    if (!embedding) return res.status(500).json({ error: "Failed to get embedding" });

    // 2. Ensure collection exists
    try {
      await qdrant.createCollection("text_collection", {
        vectors: { size: embedding.length, distance: "Cosine" },
      });
      console.log("✅ Collection created");
    } catch (error) {
      if (error.status === 409 || error?.message?.includes("already exists")) {
        console.log("❗ Collection already exists, continuing...");
      } else {
        throw error;
      }
    }

    // 3. Store the question text + embedding
    await qdrant.upsert("text_collection", {
      points: [
        {
          id: Date.now(),
          vector: embedding,
          payload: { text: question },
        },
      ],
    });

    // 4. Search in Qdrant
    const searchResult = await qdrant.search("text_collection", {
      vector: embedding,
      limit: 1,
    });

    const retrievedText = searchResult[0]?.payload?.text || "No relevant text found.";

    // 5. Call Gemini with retrieved text
    const geminiResponse = await callGemini(`Q: ${question}\nRelevant: ${retrievedText}`);

    res.json({ answer: geminiResponse });
  } catch (err) {
    console.error("Pipeline error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// -----------------------------
// Start Server
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
