let csrf = "";
export function setCsrf(value) {
  csrf = value || "";
}
export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("El servidor no respondió correctamente.");
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/") && path !== "/me")
      window.dispatchEvent(new Event("session-expired"));
    const error = new Error(data.error || "No se pudo completar la operación.");
    error.status = response.status;
    throw error;
  }
  if (data.csrfToken) setCsrf(data.csrfToken);
  return data;
}
