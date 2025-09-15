import { getEmbedding } from "./jina.js";
import { client } from "./qdrant.js";

export async function storeText(text) {
  const embedding = await getEmbedding(text);
  if (!embedding) return;

  await client.upsert("text_collection", {
    points: [
      {
        id: Date.now(),
        vector: embedding,
        payload: { text },
      },
    ],
  });
}

export async function queryText(query) {
  const embedding = await getEmbedding(query);
  if (!embedding) return null;

  const result = await client.search("text_collection", {
    vector: embedding,
    limit: 1,
  });

  return result[0]?.payload?.text || null;
}
