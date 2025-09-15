import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from "dotenv";

dotenv.config();

export const client = new QdrantClient({ url: process.env.QDRANT_URL });

export async function deleteCollection(name) {
  try {
    await client.deleteCollection(name);
    console.log("🗑️ Collection deleted:", name);
  } catch (error) {
    if (error.status === 404) {
      console.log("Collection not found, nothing to delete.");
    } else {
      throw error;
    }
  }
}

export async function createCollection(name) {
  const params = {
    vectors: {
      size: 1024,  // your embedding vector size
      distance: "Cosine",  // or "Euclid", "Dot"
    },
  };

  try {
    await client.createCollection(name, params);
    console.log("✅ Collection created:", name);
  } catch (error) {
    if (error.status === 409 || error?.message?.includes("already exists")) {
      console.log("❗ Collection already exists, continuing...");
    } else {
      throw error;
    }
  }
}

async function resetCollection(name) {
  await deleteCollection(name);
  await createCollection(name);
}

// Run the reset to fix the dimension mismatch
resetCollection("text_collection");
