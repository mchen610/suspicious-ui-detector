import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, renameSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "post-build",
      closeBundle() {
        const dist = resolve(__dirname, "dist");
        copyFileSync(
            resolve(__dirname, "manifest.json"),
            `${dist}/manifest.json`);
        renameSync(`${dist}/index.html`, `${dist}/popup.html`);
      },
    },
  ],
  root: "src/popup",
  base: "",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        content: resolve(__dirname, "src/content/index.ts")
      },
      output: {
        entryFileNames: "[name].js"
      },
    },
  },
});
