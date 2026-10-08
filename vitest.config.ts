import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { queueConsumers: [] },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
