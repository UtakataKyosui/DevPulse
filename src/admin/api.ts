export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T | null;
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

export function sendJson(
  method: 'PUT' | 'POST',
  payload: unknown,
): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
