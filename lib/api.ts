import { ZodError } from "zod";

/** JSON error response in one consistent shape: { error, details? } */
export function jsonError(status: number, error: string, details?: unknown) {
  return Response.json(details === undefined ? { error } : { error, details }, {
    status,
  });
}

/** Parses a route param like "101" into a positive integer, or null. */
export function parseId(raw: string): number | null {
  if (!/^\d{1,15}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/** Reads the request body as JSON. Returns undefined if it is not valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** Escapes % and _ so user search text is matched literally by ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

// Friendly messages for constraints the user can actually trigger.
const constraintMessages: Record<string, string> = {
  uq_product_org_sku: "A product with this SKU already exists.",
  inventory_product_id_fkey:
    "This product still has inventory records. Remove its stock first.",
  order_item_product_id_fkey:
    "This product appears in customer orders and cannot be deleted.",
};

interface PgError {
  code: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.length === 5
  );
}

/**
 * Turns anything thrown inside a route handler into a sensible HTTP response.
 * Validation and constraint errors become 400/409 with a clear message.
 * Anything unexpected becomes a plain 500; the real error is logged on the
 * server and never sent to the client.
 */
export function handleRouteError(err: unknown): Response {
  if (err instanceof ZodError) {
    return jsonError(
      400,
      "Validation failed",
      err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  if (isPgError(err)) {
    const friendly = err.constraint ? constraintMessages[err.constraint] : undefined;
    switch (err.code) {
      case "23505": // unique_violation
        return jsonError(409, friendly ?? "This record already exists.");
      case "23503": // foreign_key_violation
        return jsonError(409, friendly ?? "This record is linked to other records.");
      case "23514": // check_violation
      case "23502": // not_null_violation
      case "22003": // numeric_value_out_of_range
        return jsonError(400, friendly ?? "The data breaks a database rule.", {
          constraint: err.constraint,
        });
    }
  }

  console.error(err);
  return jsonError(500, "Internal server error");
}
