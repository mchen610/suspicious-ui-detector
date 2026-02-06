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
        copyFileSync("manifest.json", `${dist}/manifest.json`);
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
      output: { entryFileNames: "popup.js" },
    },
  },
});
