import { createHash } from "node:crypto";

export const LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER = "local_hash_v1";
export const LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS = 16;

export interface LocalKnowledgeEmbeddingInput {
  title: string;
  body: string;
  tags: string[];
}

export interface LocalKnowledgeEmbedding {
  provider: typeof LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER;
  dimensions: typeof LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS;
  vector: number[];
  textHash: string;
}

export function buildLocalKnowledgeEmbedding(input: LocalKnowledgeEmbeddingInput): LocalKnowledgeEmbedding {
  const text = normalizeEmbeddingText(input);
  const vector = Array.from({ length: LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS }, () => 0);
  let index = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const bucket = (code + index * 31) % LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS;
    const sign = (code + index) % 2 === 0 ? 1 : -1;
    vector[bucket] = (vector[bucket] ?? 0) + sign * (((code % 997) + 1) / 997);
    index += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return {
    provider: LOCAL_KNOWLEDGE_EMBEDDING_PROVIDER,
    dimensions: LOCAL_KNOWLEDGE_EMBEDDING_DIMENSIONS,
    vector: vector.map((value) => Number((value / norm).toFixed(6))),
    textHash: createHash("sha256").update(text).digest("hex"),
  };
}

function normalizeEmbeddingText(input: LocalKnowledgeEmbeddingInput): string {
  const text = [input.title, input.body, ...input.tags]
    .join("\n")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  return text.length > 0 ? text : " ";
}
