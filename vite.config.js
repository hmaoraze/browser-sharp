import { defineConfig } from "vite";

export default defineConfig({
  // 保留你的 BASE_PATH 逻辑
  base: process.env.BASE_PATH || "/",

  // 明确 publicDir
  publicDir: "public",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets"
  }
});
