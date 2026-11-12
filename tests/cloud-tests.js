"use strict";

window.NAKA_SUPABASE_CONFIG = { url: "https://test.supabase.co", publishableKey: "sb_publishable_test" };
window.cloudTest = {
  revision: 0, authorized: false, failWrite: false, badResponse: false,
  payload: { version: 1, activities: [], templateImports: [], catalogRevision: 2, management: { version: 1, agms: [], resolutions: [], meetings: [] } },
  calls: []
};
window.fetch = async (url, options) => {
  const state = window.cloudTest;
  const parsed = new URL(url);
  const body = options.body ? JSON.parse(options.body) : null;
  state.calls.push({ path: parsed.pathname, query: parsed.search, headers: options.headers, body });
  if (state.badResponse) return new Response("not json", { status: 502 });
  if (parsed.pathname === "/auth/v1/token") {
    if (body.password === "wrong") return Response.json({ msg: "Invalid login credentials" }, { status: 400 });
    return Response.json({ access_token: "test-access-token", refresh_token: "test-refresh-token", expires_in: 3600 });
  }
  if (parsed.pathname === "/auth/v1/user") return Response.json({ id: "test-id", email: "test@example.invalid" });
  if (parsed.pathname === "/rest/v1/naka_workspace") {
    if (options.headers.Authorization !== "Bearer test-access-token") throw new Error("Missing session authorization");
    if (!state.authorized) return Response.json([]);
    if (options.method === "PATCH") {
      if (state.failWrite) throw new TypeError("Simulated network failure");
      if (parsed.searchParams.get("revision") !== `eq.${state.revision}`) return Response.json([]);
      if (body.revision !== state.revision + 1) throw new Error("Revision did not increment");
      state.payload = body.payload;
      state.revision = body.revision;
      return Response.json([{ revision: state.revision }]);
    }
    return Response.json([{ revision: state.revision, payload: state.payload }]);
  }
  throw new Error(`Unexpected mocked request: ${parsed.pathname}`);
};
