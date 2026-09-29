import { createHash } from "node:crypto";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { HttpError } from "@/lib/api";

// Turns text into a vector of 384 numbers ("embedding") with the
// all-MiniLM-L6-v2 sentence model, run locally inside Node by transformers.js.
// Texts that mean similar things get vectors that point in similar
// directions, which is what the similar-product search in Qdrant relies on.
//
// The first call downloads the model (about 90 MB) from Hugging Face and
// caches it under node_modules/@huggingface/transformers/.cache, so later
// runs, and restarts, work offline.

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

// How many texts go through the model at once. Keeps memory flat when the
// whole catalogue is re-indexed.
const BATCH_SIZE = 32;

// Loading the model takes a second or two, so load it once and share it.
// Kept on globalThis so `next dev` hot reloads don't load it again.
const globalForModel = globalThis as unknown as {
  embeddingModel?: Promise<FeatureExtractionPipeline>;
};

function loadModel(): Promise<FeatureExtractionPipeline> {
  globalForModel.embeddingModel ??= pipeline("feature-extraction", EMBEDDING_MODEL, {
    dtype: "fp32",
  }).catch((err: unknown) => {
    // Forget the failed attempt so the next request tries again, e.g. once
    // the internet connection is back for the first download.
    globalForModel.embeddingModel = undefined;
    console.error(err);
    throw new HttpError(
      503,
      "The embedding model could not be loaded. The first run downloads it from Hugging Face, so check the internet connection and try again.",
    );
  });
  return globalForModel.embeddingModel;
}

/**
 * One vector per input text, in the same order. Vectors are normalised to
 * length 1 (mean pooling, as the model was trained), so cosine similarity
 * and dot product give the same ranking.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = await loadModel();

  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const output = await model(batch, { pooling: "mean", normalize: true });
    vectors.push(...(output.tolist() as number[][]));
  }
  return vectors;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/** The fields of a product that describe what it is. */
export interface ProductTextFields {
  name: string;
  category: string | null;
  description: string | null;
}

/**
 * The text a product is embedded from: name, category and description.
 * Price, stock and SKU are left out on purpose, because they say nothing
 * about what the product is.
 */
export function productText(product: ProductTextFields): string {
  return [product.name, product.category, product.description]
    .filter((part): part is string => !!part && part.trim() !== "")
    .join(". ");
}

/**
 * Short fingerprint of a product's text, stored next to its vector in
 * Qdrant. If the product is edited while Qdrant is down, the fingerprints no
 * longer match, which is how a stale vector is spotted and rebuilt.
 */
export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
