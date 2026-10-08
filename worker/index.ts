/** Composition root. Domain routes and durable handlers are added by their owners. */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json({ status: "ok", service: "picnic" }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "Niet gevonden." } }, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  },
};
