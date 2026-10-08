import { afterEach, describe, expect, it, vi } from "vitest";
import PicnicClient from "picnic-api-worker";
import { env } from "cloudflare:workers";

describe("local Worker bindings", () => {
  it("provides isolated D1, private R2, and both queue producers", async () => {
    expect(env.APP_ENV).toBe("test");
    const id = crypto.randomUUID();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS binding_smoke (id TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
    await env.DB.prepare("INSERT INTO binding_smoke (id, value) VALUES (?, ?)").bind(id, "ok").run();
    const row = await env.DB.prepare("SELECT value FROM binding_smoke WHERE id = ?").bind(id).first<{ value: string }>();
    expect(row?.value).toBe("ok");

    const key = `smoke/${id}.txt`;
    await env.UPLOADS.put(key, "private local object");
    expect(await env.UPLOADS.get(key).then((object) => object?.text())).toBe("private local object");
    await env.UPLOADS.delete(key);

    expect(typeof env.IMPORT_QUEUE.send).toBe("function");
    expect(typeof env.ADD_QUEUE.send).toBe("function");
  });

  it("loads picnic-api and runs its MD5 login path against a stubbed fetch", async () => {
    const response = new Response(JSON.stringify({ second_factor_authentication_required: false }), {
      status: 200,
      headers: { "content-type": "application/json", "x-picnic-auth": "local-smoke-token" },
    });
    const fetchStub = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response.clone());
    vi.stubGlobal("fetch", fetchStub);

    const client = new PicnicClient({
      countryCode: "NL",
      url: "https://picnic-smoke.invalid/api/15",
    });
    await client.auth.login("smoke@example.invalid", "not-a-real-secret");

    expect(fetchStub).toHaveBeenCalledOnce();
    expect(fetchStub.mock.calls[0]?.[0]).toBe("https://picnic-smoke.invalid/api/15/user/login");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
