import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export async function callGemini(prompt) {
  try {
    const response = await axios.post(
      "https://api.gemini.ai/v1/chat/completions", // replace with correct endpoint
      {
        model: "gemini-1",
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` },
      }
    );

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("Gemini API error:", err.message);
    return "Gemini error";
  }
}
