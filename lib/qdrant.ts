import { QdrantClient } from "@qdrant/js-client-rest";
import { HttpError } from "@/lib/api";
import { EMBEDDING_DIMENSIONS } from "@/lib/embeddings";

// Qdrant is the vector database. It holds one point per product:
//   id      = product.product_id (the same number as in PostgreSQL)
//   vector  = embedding of the product's name, category and description
//   payload = organization_id, name, sku, category and a text fingerprint
// PostgreSQL stays the source of truth. Qdrant only answers "which products
// are closest to this vector?", and the API reads the real rows back from
// PostgreSQL before returning anything.

export const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
export const PRODUCT_COLLECTION = process.env.QDRANT_COLLECTION ?? "products";

const globalForQdrant = globalThis as unknown as {
  qdrant?: QdrantClient;
  qdrantCollectionChecked?: boolean;
};

export const qdrant =
  globalForQdrant.qdrant ??
  new QdrantClient({
    url: QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY || undefined,
    // Skip the version check the client does on startup. It makes a request
    // at import time and prints a warning whenever Qdrant isn't running yet.
    checkCompatibility: false,
    timeout: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForQdrant.qdrant = qdrant;
}

export interface ProductPointPayload {
  organization_id: number;
  product_id: number;
  name: string;
  sku: string;
  category: string | null;
  text_hash: string;
}

/** Status code of an error returned by Qdrant, if it has one. */
function qdrantStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** True for "No point with id ... found" and similar 404s. */
export function isNotFound(err: unknown): boolean {
  return qdrantStatus(err) === 404;
}

/**
 * Runs a Qdrant call and turns "Qdrant isn't running" into a clear 503
 * instead of a generic 500. Any other error is passed through unchanged.
 */
export async function callQdrant<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause;
    const unreachable =
      err instanceof TypeError ||
      cause?.code === "ECONNREFUSED" ||
      (err instanceof Error && err.constructor.name === "QdrantClientTimeoutError");
    if (unreachable) {
      throw new HttpError(
        503,
        `Can't reach the Qdrant vector database at ${QDRANT_URL}. Start qdrant.exe, then try again.`,
      );
    }
    throw err;
  }
}

/**
 * Creates the products collection if it isn't there (first run, or Qdrant's
 * storage was wiped). Cosine distance matches how the model's vectors are
 * compared. The payload indexes on organization_id and category make the
 * filters on every search cheap, like a B-tree index on a foreign key
 * column in PostgreSQL. The existence check is one small request, so it runs
 * every time; the vector size is checked once per server start.
 */
export async function ensureProductCollection(): Promise<void> {
  await callQdrant(async () => {
    const { exists } = await qdrant.collectionExists(PRODUCT_COLLECTION);
    if (!exists) {
      try {
        await qdrant.createCollection(PRODUCT_COLLECTION, {
          vectors: { size: EMBEDDING_DIMENSIONS, distance: "Cosine" },
        });
      } catch (err) {
        // Two requests raced to create it; the other one won, which is fine.
        if (qdrantStatus(err) !== 409) throw err;
      }
      await qdrant.createPayloadIndex(PRODUCT_COLLECTION, {
        field_name: "organization_id",
        field_schema: "integer",
        wait: true,
      });
      await qdrant.createPayloadIndex(PRODUCT_COLLECTION, {
        field_name: "category",
        field_schema: "keyword",
        wait: true,
      });
      globalForQdrant.qdrantCollectionChecked = true;
      return;
    }

    if (globalForQdrant.qdrantCollectionChecked) return;
    // A collection left over from a different model would give nonsense
    // results, so refuse to use it rather than guess.
    const info = await qdrant.getCollection(PRODUCT_COLLECTION);
    const vectors = info.config.params.vectors;
    const size =
      vectors && typeof vectors === "object" && "size" in vectors ? vectors.size : undefined;
    if (size !== EMBEDDING_DIMENSIONS) {
      throw new HttpError(
        500,
        `The Qdrant collection "${PRODUCT_COLLECTION}" stores vectors of size ${size ?? "unknown"}, but the model makes ${EMBEDDING_DIMENSIONS}. Delete the collection in Qdrant and rebuild the search index.`,
      );
    }
    globalForQdrant.qdrantCollectionChecked = true;
  });
}

/**
 * Filter that keeps a search inside one organization, and optionally one
 * category. Qdrant applies it while searching (not afterwards), so asking
 * for 5 results still gives 5 from the right organization.
 */
export function productFilter(organizationId: number, category?: string) {
  const must: { key: string; match: { value: number | string } }[] = [
    { key: "organization_id", match: { value: organizationId } },
  ];
  if (category) must.push({ key: "category", match: { value: category } });
  return { must };
}
