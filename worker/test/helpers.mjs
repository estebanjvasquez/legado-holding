/* Mock de fetch por URL. `routes` es una lista de [predicado, handler]; cada
   llamada queda registrada en `calls` con su body parseado. */
export function mockFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch (_) { body = init.body; }
    calls.push({ url, method: init.method || "GET", body, init });
    for (const [match, handler] of routes) {
      if (match(url, init)) return handler(url, init, calls);
    }
    throw new Error(`fetch no mockeado: ${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export const isOpenAI = (url) => url.startsWith("https://api.openai.com/");
export const isPF = (url) => url.includes("/api/public/t/");
export const isSupabase = (url) => url.includes(".supabase.co/");
