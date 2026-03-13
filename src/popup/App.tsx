import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

interface Detection {
	id: number;
	type: string;
	reason: string;
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="flex items-center justify-between cursor-pointer">
			<span className="text-sm text-gray-600">{label}</span>
			<button
				type="button"
				role="switch"
				aria-checked={on}
				onClick={() => onChange(!on)}
				className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-blue-500" : "bg-gray-300"}`}
			>
				<span
					className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4.5" : "translate-x-0.5"}`}
				/>
			</button>
		</label>
	);
}

function App() {
	const [detections, setDetections] = useState<Detection[]>([]);
	const [loading, setLoading] = useState(true);
	const [detectionEnabled, setDetectionEnabled] = useState(true);
	const [trustThisSite, setTrustThisSite] = useState(false);
	const [currentHostname, setCurrentHostname] = useState<string | null>(null);
	const [settingsLoaded, setSettingsLoaded] = useState(false);

	useEffect(() => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			const tab = tabs[0];
			const hostname = tab?.url ? new URL(tab.url).hostname : null;
			setCurrentHostname(hostname);

			chrome.storage.local.get(["detectionEnabled", "trustedSites"], (result) => {
				setDetectionEnabled(result["detectionEnabled"] !== false);
				const trusted: string[] = result["trustedSites"] ?? [];
				setTrustThisSite(hostname !== null && trusted.includes(hostname));
				setSettingsLoaded(true);
			});

			if (!tab?.id) {
				setLoading(false);
				return;
			}

			chrome.tabs.sendMessage(tab.id, { type: "getDetections" }, (response) => {
				if (chrome.runtime.lastError) {
					setLoading(false);
					return;
				}
				setDetections(response ?? []);
				setLoading(false);
			});
		});
	}, []);

	function handleDetectionEnabled(value: boolean) {
		setDetectionEnabled(value);
		chrome.storage.local.set({ detectionEnabled: value });
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id) {
				chrome.tabs.sendMessage(tabs[0].id, { type: "detectionToggle", enabled: value });
			}
		});
	}

	function handleTrustThisSite(value: boolean) {
		setTrustThisSite(value);
		chrome.storage.local.get(["trustedSites"], (result) => {
			const trusted: string[] = result["trustedSites"] ?? [];
			const updated = value
				? [...new Set([...trusted, currentHostname])]
				: trusted.filter((h) => h !== currentHostname);
			chrome.storage.local.set({ trustedSites: updated });
		});
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id) {
				chrome.tabs.sendMessage(tabs[0].id, { type: "detectionToggle", enabled: !value });
			}
		});
	}

	return (
		<div className="w-[280px] bg-white font-sans">
			<div className="px-4 py-3 border-b border-gray-100">
				<h1 className="text-sm font-semibold text-gray-900">Suspicious UI Detector</h1>
			</div>

			<div className="px-4 py-3 border-b border-gray-100">
				{loading ? (
					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
						<span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
						Scanning...
					</span>
				) : detections.length > 0 ? (
					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
						<span className="w-1.5 h-1.5 rounded-full bg-red-500" />
						{detections.length} suspicious element{detections.length !== 1 && "s"} found
					</span>
				) : (
					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
						<span className="w-1.5 h-1.5 rounded-full bg-green-500" />
						Page looks safe
					</span>
				)}
			</div>

			{settingsLoaded && (
				<div className="px-4 py-2.5 flex flex-col gap-2.5">
					<Toggle label="Enable detection" on={detectionEnabled} onChange={handleDetectionEnabled} />
					<Toggle label="Trust this site" on={trustThisSite} onChange={handleTrustThisSite} />
				</div>
			)}
		</div>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
