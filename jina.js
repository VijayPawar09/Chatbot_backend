import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export async function getEmbedding(text) {
  try {
    if (!text || text.trim() === "") throw new Error("Text cannot be empty");

    const response = await axios.post(
      "https://api.jina.ai/v1/embeddings",
      {
        model: "jina-embeddings-v3", // specify a valid model
        input: [text]                     // array of strings
      },
      {
        headers: { Authorization: `Bearer ${process.env.JINA_API_KEY}` },
      }
    );

    return response.data.data[0].embedding; // updated path to vector
  } catch (err) {
    console.error("Jina embedding error:", err.response?.data || err.message);
    return null;
  }
}
