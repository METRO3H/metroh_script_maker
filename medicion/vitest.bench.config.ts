import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

// Solo para medir: NO forma parte del proyecto entregado.
const SRC = process.env.BENCH_SRC ?? path.resolve("src");
export default defineConfig({
  plugins: [svelte({ hot: false, compilerOptions: { dev: false } })],
  resolve: {
    conditions: ["browser", "production"],
    alias: {
      "@components": SRC + "/components", "@lib": SRC + "/lib", "@utils": SRC + "/utils",
      "@types": SRC + "/types", "@styles": SRC + "/styles", "@layouts": SRC + "/layouts",
      "@pages": SRC + "/pages", "@assets": SRC + "/assets",
    },
  },
  test: { environment: "jsdom", include: [process.env.BENCH_FILE ?? "bench/**/render.test.ts"], testTimeout: 300000, pool: "forks" },
});
