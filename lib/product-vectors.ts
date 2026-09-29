import pool from "@/lib/db";
import { embedText, embedTexts, productText, textHash } from "@/lib/embeddings";
import {
  PRODUCT_COLLECTION,
  callQdrant,
  ensureProductCollection,
  isNotFound,
  productFilter,
  qdrant,
  type ProductPointPayload,
} from "@/lib/qdrant";
import type { ProductMatch, VectorIndexStatus } from "@/lib/types";

// Keeps the Qdrant copy of each product in step with PostgreSQL, and runs
// the two searches that use it: "products similar to this one" and
// "products that match this description".

// Semantic search always returns *something*, however poor the match. Below
// this cosine similarity a result is noise (e.g. "tea" against laptops), so
// it is dropped. Chosen by trying queries against the seed data.
const MIN_SEARCH_SCORE = 0.25;

// Ask Qdrant for a few more results than needed, so any leftover points
// that loadMatches drops don't leave the list short.
const EXTRA_RESULTS = 5;

interface ProductTextRow {
  product_id: number;
  organization_id: number;
  name: string;
  sku: string;
  category: string | null;
  description: string | null;
}

/**
 * Embeds products and writes them to Qdrant (insert or overwrite). With no
 * ids, does the organization's whole catalogue. Returns how many were
 * written. Rows are read from PostgreSQL here, so a caller can never index
 * a product from another organization.
 */
export async function indexProducts(
  organizationId: number,
  productIds?: number[],
): Promise<number> {
  const { rows } = await pool.query<ProductTextRow>(
    `SELECT product_id, organization_id, name, sku, category, description
     FROM product
     WHERE organization_id = $1
       AND ($2::bigint[] IS NULL OR product_id = ANY($2::bigint[]))
     ORDER BY product_id`,
    [organizationId, productIds ?? null],
  );
  if (rows.length === 0) return 0;

  const texts = rows.map(productText);
  const vectors = await embedTexts(texts);

  await ensureProductCollection();
  await callQdrant(() =>
    qdrant.upsert(PRODUCT_COLLECTION, {
      wait: true,
      points: rows.map((row, i) => ({
        id: row.product_id,
        vector: vectors[i],
        payload: {
          organization_id: row.organization_id,
          product_id: row.product_id,
          name: row.name,
          sku: row.sku,
          category: row.category,
          text_hash: textHash(texts[i]),
        } satisfies ProductPointPayload,
      })),
    }),
  );
  return rows.length;
}

/** Removes products' points from Qdrant (after they are deleted in PostgreSQL). */
export async function removeProductVectors(productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  await ensureProductCollection();
  await callQdrant(() =>
    qdrant.delete(PRODUCT_COLLECTION, { wait: true, points: productIds }),
  );
}

/**
 * For use inside after(): keeping Qdrant in sync must never make a product
 * save fail, because PostgreSQL already has the change. If Qdrant is down
 * the vector is simply out of date until the next similar-products lookup
 * or index rebuild notices and fixes it.
 */
export async function syncProductVectorQuietly(
  organizationId: number,
  productId: number,
  action: "index" | "remove",
): Promise<void> {
  try {
    if (action === "index") await indexProducts(organizationId, [productId]);
    else await removeProductVectors([productId]);
  } catch (err) {
    console.warn(
      `Could not ${action} product ${productId} in Qdrant:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * seed.sql writes to PostgreSQL only, so on first use Qdrant has nothing
 * for the organization (the same happens if Qdrant's storage is wiped). If
 * so, index its whole catalogue before searching, so search works without
 * pressing "Rebuild" first. The check is one filtered count, which the
 * organization_id payload index makes cheap.
 */
async function ensureOrganizationIndexed(organizationId: number): Promise<void> {
  await ensureProductCollection();
  const { count } = await callQdrant(() =>
    qdrant.count(PRODUCT_COLLECTION, { filter: productFilter(organizationId), exact: true }),
  );
  if (count === 0) await indexProducts(organizationId);
}

/**
 * Qdrant only returns ids and scores. Read the real rows (with stock totals,
 * same as the product list) from PostgreSQL, keeping Qdrant's order. Any id
 * PostgreSQL no longer has is a leftover point; it is skipped and removed.
 */
async function loadMatches(
  organizationId: number,
  hits: { id: string | number; score: number }[],
  limit: number,
): Promise<ProductMatch[]> {
  if (hits.length === 0) return [];
  const ids = hits.map((hit) => Number(hit.id));

  const { rows } = await pool.query(
    `SELECT p.product_id, p.name, p.sku, p.description, p.category,
            p.unit_price, p.reorder_level, p.created_at,
            COALESCE(s.quantity, 0)  AS total_quantity,
            COALESCE(s.available, 0) AS total_available
     FROM product p
     LEFT JOIN (
         SELECT product_id,
                SUM(quantity)                     AS quantity,
                SUM(quantity - reserved_quantity) AS available
         FROM inventory
         WHERE product_id = ANY($1::bigint[])
         GROUP BY product_id
     ) s ON s.product_id = p.product_id
     WHERE p.product_id = ANY($1::bigint[]) AND p.organization_id = $2`,
    [ids, organizationId],
  );

  const byId = new Map(rows.map((row) => [row.product_id as number, row]));
  const leftovers = ids.filter((id) => !byId.has(id));
  if (leftovers.length > 0) {
    removeProductVectors(leftovers).catch(() => {});
  }

  return hits
    .filter((hit) => byId.has(Number(hit.id)))
    .slice(0, limit)
    .map((hit) => ({
      ...byId.get(Number(hit.id)),
      score: Math.round(hit.score * 1000) / 1000,
    }));
}

/**
 * The products whose descriptions are closest in meaning to this one, in
 * the same organization. The caller has already checked that the product
 * exists and belongs to the organization.
 */
export async function findSimilarProducts(
  organizationId: number,
  productId: number,
  limit: number,
): Promise<ProductMatch[]> {
  await ensureOrganizationIndexed(organizationId);

  // Make sure the product's own point exists and matches its current text.
  // It can be missing or stale if Qdrant was down when it was saved.
  const { rows } = await pool.query<ProductTextRow>(
    `SELECT product_id, organization_id, name, sku, category, description
     FROM product WHERE product_id = $1 AND organization_id = $2`,
    [productId, organizationId],
  );
  if (rows.length === 0) return [];
  const [stored] = await callQdrant(() =>
    qdrant.retrieve(PRODUCT_COLLECTION, { ids: [productId], with_payload: ["text_hash"] }),
  );
  if (!stored || stored.payload?.text_hash !== textHash(productText(rows[0]))) {
    await indexProducts(organizationId, [productId]);
  }

  // Query by point id: Qdrant uses that point's stored vector and leaves the
  // point itself out of the results.
  try {
    const { points } = await callQdrant(() =>
      qdrant.query(PRODUCT_COLLECTION, {
        query: productId,
        filter: productFilter(organizationId),
        limit: limit + EXTRA_RESULTS,
        with_payload: false,
      }),
    );
    return loadMatches(organizationId, points, limit);
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

/**
 * Search by meaning instead of by name: "wireless mouse for the office"
 * finds the Logitech MX Master even though none of those words is in its
 * name. The query text is embedded with the same model as the products.
 */
export async function searchProductsByMeaning(
  organizationId: number,
  text: string,
  options: { category?: string; limit: number },
): Promise<ProductMatch[]> {
  const vector = await embedText(text);
  await ensureOrganizationIndexed(organizationId);

  const { points } = await callQdrant(() =>
    qdrant.query(PRODUCT_COLLECTION, {
      query: vector,
      filter: productFilter(organizationId, options.category),
      limit: options.limit + EXTRA_RESULTS,
      score_threshold: MIN_SEARCH_SCORE,
      with_payload: false,
    }),
  );
  return loadMatches(organizationId, points, options.limit);
}

/**
 * Compares this organization's products in PostgreSQL with its points in
 * Qdrant: how many are up to date, stale (text changed since indexing),
 * missing from Qdrant, or left over in Qdrant after being deleted.
 */
export async function getVectorIndexStatus(organizationId: number): Promise<VectorIndexStatus> {
  const { rows } = await pool.query<ProductTextRow>(
    `SELECT product_id, organization_id, name, sku, category, description
     FROM product WHERE organization_id = $1`,
    [organizationId],
  );
  const expected = new Map(rows.map((row) => [row.product_id, textHash(productText(row))]));

  await ensureProductCollection();
  const indexed = new Map<number, string | undefined>();
  let offset: string | number | undefined = undefined;
  do {
    const page: Awaited<ReturnType<typeof qdrant.scroll>> = await callQdrant(() =>
      qdrant.scroll(PRODUCT_COLLECTION, {
        filter: productFilter(organizationId),
        with_payload: ["text_hash"],
        with_vector: false,
        limit: 256,
        offset,
      }),
    );
    for (const point of page.points) {
      indexed.set(Number(point.id), point.payload?.text_hash as string | undefined);
    }
    const next = page.next_page_offset;
    offset = typeof next === "number" || typeof next === "string" ? next : undefined;
  } while (offset !== undefined);

  let upToDate = 0;
  let stale = 0;
  let missing = 0;
  for (const [id, hash] of expected) {
    if (!indexed.has(id)) missing++;
    else if (indexed.get(id) === hash) upToDate++;
    else stale++;
  }
  const orphaned = [...indexed.keys()].filter((id) => !expected.has(id));

  return {
    products: expected.size,
    up_to_date: upToDate,
    stale,
    missing,
    orphaned: orphaned.length,
    orphaned_ids: orphaned,
  };
}

/** Re-embeds every product in the organization and removes leftover points. */
export async function rebuildVectorIndex(organizationId: number): Promise<VectorIndexStatus> {
  const before = await getVectorIndexStatus(organizationId);
  await indexProducts(organizationId);
  await removeProductVectors(before.orphaned_ids);
  return getVectorIndexStatus(organizationId);
}
