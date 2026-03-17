const BASE = import.meta.env.VITE_API_URL ?? "";

export function getToken(): string | null {
  return localStorage.getItem("crm_token");
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem("crm_token", access);
  localStorage.setItem("crm_refresh", refresh);
}

export function clearTokens(): void {
  localStorage.removeItem("crm_token");
  localStorage.removeItem("crm_refresh");
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(
      typeof err.detail === "string"
        ? err.detail
        : JSON.stringify(err.detail) || "Request failed"
    );
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}
