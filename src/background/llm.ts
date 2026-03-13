import { CreateMLCEngine, MLCEngineInterface } from "@mlc-ai/web-llm";

export const MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

let engine: MLCEngineInterface | null = null;
let engineInitPromise: Promise<MLCEngineInterface> | null = null;

export function getEngine(): Promise<MLCEngineInterface> {
	if (engine) return Promise.resolve(engine);
	if (engineInitPromise) return engineInitPromise;

	console.log("[suspicious-ui-detector] loading model:", MODEL_ID);
	engineInitPromise = CreateMLCEngine(MODEL_ID, {
		initProgressCallback: ({ text, progress }) => {
			console.log(`[suspicious-ui-detector] ${(progress * 100).toFixed(0)}% — ${text}`);
		},
	}).then((e) => {
		engine = e;
		console.log("[suspicious-ui-detector] model ready");
		return e;
	}).catch((err) => {
		engineInitPromise = null;
		console.error("[suspicious-ui-detector] failed to load model:", err ?? "unknown error (is WebGPU available?)");
		throw new Error(`Model failed to load: ${err ?? "unknown"}`);
	});

	return engineInitPromise;
}
