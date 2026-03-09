import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
   build: {
       lib: {
           entry: resolve(__dirname, "tests/integration/helpers/pipeline-entry.ts"),
           name: "PipelineTestEntry",
           formats: ["iife"],
           fileName: () => "pipeline.js"
       },
       outDir: "tests/integration/fixtures",
       emptyOutDir: false,
       sourcemap: true,
   },
});