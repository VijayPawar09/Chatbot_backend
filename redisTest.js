import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

export const redis = new Redis(process.env.REDIS_URL);

export async function testRedis() {
  try {
    await redis.set("RAG", "Chatbot");
    const value = await redis.get("RAG");
    console.log("📦 Retrieved from Redis:", value);
  } catch (err) {
    console.error("Redis error:", err);
  } 
}
