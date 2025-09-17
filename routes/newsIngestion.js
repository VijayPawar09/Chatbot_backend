import express from "express";
import Parser from "rss-parser";
import fetch from "node-fetch";
import { QdrantClient } from "@qdrant/js-client-rest";

const router = express.Router();
const parser = new Parser();

// --- CONFIG ---
const COLLECTION_NAME = "news_articles";
const JINA_API = "https://api.jina.ai/v1/embeddings";
const JINA_API_KEY = process.env.JINA_API_KEY; // keep in .env
const qdrant = new QdrantClient({ url: "http://localhost:6333" });

// --- Helpers ---

// Break article into chunks of ~3 sentences
function chunkText(text, chunkSize = 3) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

// Get embedding from Jina
async function getEmbedding(text) {
  const res = await fetch(JINA_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JINA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-embeddings-v2-base-en",
      input: text,
    }),
  });

  const data = await res.json();
  return data.data[0].embedding;
}

// --- Route: Ingest News ---
router.get("/ingest-news", async (req, res) => {
  try {
    // 1. Fetch ~50 news articles (Reuters RSS)
    const feed = await parser.parseURL("http://feeds.reuters.com/reuters/topNews");
    const articles = feed.items.slice(0, 50);

    // 2. Ensure collection exists
    await qdrant.recreateCollection(COLLECTION_NAME, {
      vectors: { size: 768, distance: "Cosine" }, // Jina embeddings v2 base
    });

    const points = [];

    // 3. For each article → chunk + embed + prepare payload
    for (let i = 0; i < articles.length; i++) {
      const { title, link, contentSnippet } = articles[i];
      const text = contentSnippet || "";

      const chunks = chunkText(text);
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];
        if (!chunk.trim()) continue;

        const embedding = await getEmbedding(chunk);
        points.push({
          id: `${i}-${j}`,
          vector: embedding,
          payload: { title, url: link, text: chunk },
        });
      }
    }

    // 4. Insert into Qdrant
    await qdrant.upsert(COLLECTION_NAME, { points });

    res.json({ message: "✅ News ingestion complete", count: points.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "❌ News ingestion failed" });
  }
});

export default router;
