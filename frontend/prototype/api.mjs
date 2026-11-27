export async function api(path, method = "GET", body, signal) {
  let response;
  try {
    response = await fetch("/api" + path, {
      method, signal, credentials: "same-origin", cache: "no-store",
      ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("Could not reach PayShare. Check that the server is running and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw Object.assign(new Error(data?.error || "PayShare could not complete this request. Try again."), { status: response.status });
  }
  return data;
}
