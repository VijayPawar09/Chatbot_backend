# RAG Chatbot Backend

A Node.js/Express backend implementing a Retrieval-Augmented Generation (RAG) pipeline for a news chatbot.

## Tech Stack

- **Framework**: Node.js with Express
- **Vector Database**: Qdrant
- **Cache & Sessions**: Redis
- **LLM API**: Google Gemini Pro
- **Embeddings**: Jina Embeddings API
- **Real-time Communication**: Socket.IO

## Architecture

### RAG Pipeline
1. **Data Ingestion**: News articles are scraped and processed
2. **Embedding**: Text is converted to vectors using Jina Embeddings
3. **Storage**: Vectors stored in Qdrant vector database
4. **Retrieval**: Top-k relevant articles retrieved for each query
5. **Generation**: Gemini API generates contextual responses

### Caching Strategy
- **Session Management**: Redis stores chat history with TTL
- **TTL Configuration**: 1 hour default (configurable via environment)
- **Cache Warming**: Articles pre-indexed on server startup

## Setup

### Prerequisites
- Node.js 18+
- Redis server
- Qdrant server

### Installation

1. **Clone and install dependencies**:
```bash
git clone <repository-url>
cd rag-chatbot-backend
npm install
```

2. **Configure environment variables**:
```bash
cp .env.example .env
# Edit .env with your API keys and service URLs
```

3. **Start required services**:

**Redis** (using Docker):
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

**Qdrant** (using Docker):
```bash
docker run -p 6333:6333 qdrant/qdrant
```

4. **Start the server**:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/session` | Create new session |
| POST | `/api/chat` | Send chat message |
| GET | `/api/history/:sessionId` | Get session history |
| DELETE | `/api/session/:sessionId` | Clear session |

### Socket.IO Events

| Event | Description |
|-------|-------------|
| `join-session` | Join a chat session |
| `send-message` | Send message to session |
| `message` | Receive message broadcast |
| `error` | Error notification |

## Configuration

### Environment Variables

```bash
# Required
GEMINI_API_KEY=your_gemini_api_key
JINA_API_KEY=your_jina_api_key

# Optional (with defaults)
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
PORT=5000
SESSION_TTL=3600
```

### Cache Configuration

**TTL Settings**:
- Session TTL: 1 hour (configurable)
- Automatic cleanup of expired sessions
- In-memory storage for fast access

**Cache Warming**:
- Articles indexed on server startup
- ~50 sample news articles embedded and stored
- Vector search optimized with cosine similarity

## Performance Optimizations

1. **Connection Pooling**: Redis client with connection pooling
2. **Batch Processing**: Articles processed in batches during indexing
3. **Async Operations**: Non-blocking I/O for all external API calls
4. **Error Handling**: Graceful degradation with fallback responses

## Monitoring & Logging

- Health check endpoint at `/health`
- Structured logging for debugging
- Error tracking for external API failures
- Performance metrics for response times

## Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    depends_on:
      - redis
      - qdrant
    environment:
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"

  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
```

## Testing

```bash
npm test
```

## Scaling Considerations

1. **Horizontal Scaling**: Stateless design allows multiple instances
2. **Load Balancing**: Redis ensures session consistency across instances
3. **Database Sharding**: Qdrant supports distributed deployments
4. **Rate Limiting**: Implement rate limiting for production use

## API Keys Setup

1. **Gemini API**: Get from [Google AI Studio](https://aistudio.google.com/apikey)
2. **Jina Embeddings**: Sign up at [Jina AI](https://jina.ai/embeddings)

## License

MIT