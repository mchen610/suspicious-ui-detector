export interface ModelOption {
	id: string;
	name: string;
	vramMB: number;
}

export interface ModelGroup {
	label: string;
	models: ModelOption[];
}

export const DEFAULT_MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

export function suggestModelId(maxBufferSizeMB: number): string {
	const allModels = MODEL_GROUPS.flatMap(g => g.models);
	const vramCeilingMB = maxBufferSizeMB * 1.25;
	// Prefer Qwen3 models — best tested for our classification task
	const qwen3 = allModels.filter(m => m.id.startsWith("Qwen3-") && m.vramMB <= vramCeilingMB);
	if (qwen3.length > 0) return qwen3[qwen3.length - 1].id;
	// Fallback to largest model that fits
	const candidates = allModels.filter(m => m.vramMB <= vramCeilingMB);
	if (candidates.length === 0) return allModels[0].id;
	return candidates[candidates.length - 1].id;
}

export const MODEL_GROUPS: ModelGroup[] = [
	{
		label: "Small (< 1.5 GB)",
		models: [
			{ id: "SmolLM2-360M-Instruct-q4f32_1-MLC", name: "SmolLM2 360M", vramMB: 580 },
			{ id: "TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC", name: "TinyLlama 1.1B", vramMB: 840 },
			{ id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Llama 3.2 1B", vramMB: 879 },
			{ id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 0.5B", vramMB: 945 },
			{ id: "Qwen3-0.6B-q4f16_1-MLC", name: "Qwen3 0.6B", vramMB: 1403 },
		],
	},
	{
		label: "Medium (1.5 – 3.5 GB)",
		models: [
			{ id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen2.5 1.5B", vramMB: 1630 },
			{ id: "Qwen3-1.7B-q4f16_1-MLC", name: "Qwen3 1.7B", vramMB: 2037 },
			{ id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 3B", vramMB: 2264 },
			{ id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", name: "Qwen2.5 3B", vramMB: 2505 },
			{ id: "Qwen3-4B-q4f16_1-MLC", name: "Qwen3 4B", vramMB: 3432 },
		],
	},
	{
		label: "Large (3.5+ GB)",
		models: [
			{ id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi 3.5 Mini", vramMB: 3672 },
			{ id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama 3.1 8B", vramMB: 5001 },
			{ id: "Qwen2.5-7B-Instruct-q4f16_1-MLC", name: "Qwen2.5 7B", vramMB: 5107 },
			{ id: "Qwen3-8B-q4f16_1-MLC", name: "Qwen3 8B", vramMB: 5696 },
		],
	},
];
