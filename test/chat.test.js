import request from 'supertest';
import { createServer } from 'http';
import app from '../server.js';
import { redis } from '../server.js';

const server = createServer(app);

// Test data
let testSessionId;

beforeAll(async () => {
  // Set up test data
  testSessionId = 'test-session-' + Date.now();
  await redis.set(`chat:${testSessionId}`, JSON.stringify([]), 'EX', 60 * 60);
});

afterAll(async () => {
  // Clean up test data
  await redis.del(`chat:${testSessionId}`);
  server.close();
});

describe('Chat API', () => {
  test('should create a new session', async () => {
    const response = await request(server)
      .post('/api/chat/session')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('sessionId');
    expect(typeof response.body.sessionId).toBe('string');
  });

  test('should send and receive messages', async () => {
    const message = 'What are the latest news about technology?';
    
    const response = await request(server)
      .post('/api/chat/message')
      .send({
        sessionId: testSessionId,
        message
      })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('response');
    expect(response.body).toHaveProperty('history');
    expect(Array.isArray(response.body.history)).toBe(true);
    expect(response.body.history.length).toBe(2); // User message + assistant response
  });

  test('should retrieve chat history', async () => {
    const response = await request(server)
      .get(`/api/chat/session/${testSessionId}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  test('should reset chat session', async () => {
    const response = await request(server)
      .post(`/api/chat/session/${testSessionId}/reset`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    
    // Verify history is empty after reset
    const history = await redis.get(`chat:${testSessionId}`);
    expect(JSON.parse(history)).toEqual([]);
  });

  test('should return 404 for non-existent session', async () => {
    const nonExistentSession = 'non-existent-session';
    
    await request(server)
      .get(`/api/chat/session/${nonExistentSession}`)
      .expect(404);
  });
});
