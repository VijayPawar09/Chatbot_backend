import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getEmbedding } from '../jina.js';
import { client as qdrantClient } from '../qdrant.js';
import { callGemini } from '../gemini.js';
import { redis } from '../server.js';

const router = express.Router();
const CHAT_HISTORY_PREFIX = 'chat:';
const VECTOR_COLLECTION = 'news_articles';

// Generate a new session ID
router.post('/session', (req, res) => {
  const sessionId = uuidv4();
  redis.set(`${CHAT_HISTORY_PREFIX}${sessionId}`, JSON.stringify([]), 'EX', 60 * 60 * 24); // 24h TTL
  res.json({ sessionId });
});

// Get chat history for a session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await redis.get(`${CHAT_HISTORY_PREFIX}${sessionId}`);
    if (!history) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(JSON.parse(history));
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Process chat message
router.post('/chat', async (req, res) => {
  const { sessionId, message } = req.body;
  
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  try {
    // Get chat history
    const historyKey = `${CHAT_HISTORY_PREFIX}${sessionId}`;
    let history = [];
    const historyStr = await redis.get(historyKey);
    if (historyStr) {
      history = JSON.parse(historyStr);
    } else {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get relevant context using RAG
    const queryEmbedding = await getEmbedding(message);
    const searchResults = await qdrantClient.search(VECTOR_COLLECTION, {
      vector: queryEmbedding,
      limit: 3, // Get top 3 relevant articles
      with_payload: true,
    });

    // Format context for the prompt
    const context = searchResults
      .map(result => result.payload.text)
      .join('\n\n');

    // Create prompt with context and chat history
    const prompt = `You are a helpful news assistant. Use the following context to answer the question. If you don't know the answer, say you don't know.

Context:
${context}

Chat History:
${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

User: ${message}
Assistant:`;

    // Get response from Gemini
    const response = await callGemini(prompt);

    // Update chat history
    const userMessage = { role: 'user', content: message };
    const assistantMessage = { role: 'assistant', content: response };
    const updatedHistory = [...history, userMessage, assistantMessage];
    
    // Save updated history with TTL
    await redis.set(historyKey, JSON.stringify(updatedHistory), 'EX', 60 * 60 * 24);

    res.json({
      response,
      sessionId,
      history: updatedHistory
    });

  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Reset chat session
router.post('/session/:sessionId/reset', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await redis.set(`${CHAT_HISTORY_PREFIX}${sessionId}`, JSON.stringify([]), 'EX', 60 * 60 * 24);
    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting session:', error);
    res.status(500).json({ error: 'Failed to reset session' });
  }
});

export default router;
