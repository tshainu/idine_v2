// Small typed HTTP helper for the iDine v2 REST API.
//
// The old code called the Hono client (`api.orders.$get(...)`) against a stubbed
// `AppType = Hono<any,any,any>`, so every call was typed `never` and screens had to
// cast with `as any`. This wrapper gives real return types per query hook instead.
import Constants from "expo-constants";

const configured: string =
  (Constants.expoConfig?.extra as any)?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  "https://idinev2.69-169-97-195.sslip.io/";

export const API_BASE = configured.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function url(path: string, query?: Query) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return `${API_BASE}/api${clean}${qs ? `?${qs}` : ""}`;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), {
      method,
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    // Restaurant wifi drops constantly — surface a human message, not "Network request failed".
    throw new ApiError("No connection to the server. Check wifi and try again.", 0);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) => request<T>("PATCH", path, { body, query }),
  del: <T>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
};
