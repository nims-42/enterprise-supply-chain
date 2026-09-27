// Small wrapper around fetch() for calling our own API from the browser.
// It turns the API's { error, details } responses into a thrown ApiError,
// so pages can just try/catch.

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? `Request failed (${response.status})`,
      Array.isArray(body?.details) ? body.details : [],
    );
  }
  return body as T;
}
