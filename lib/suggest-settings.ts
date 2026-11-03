// AI の提案の設定。本文を外部に送る機能なので、端末ごとに選べて既定はオフ (docs/ai-suggest-design.md)
import { storage } from "wxt/utils/storage";

export type SuggestSettings = {
	enabled: boolean;
	apiKey: string;
};

const KEY = "local:suggest-settings";
const DEFAULTS: SuggestSettings = { enabled: false, apiKey: "" };

export async function getSuggestSettings(): Promise<SuggestSettings> {
	const saved = await storage.getItem<Partial<SuggestSettings>>(KEY);
	return { ...DEFAULTS, ...saved };
}

export function setSuggestSettings(settings: SuggestSettings): Promise<void> {
	return storage.setItem(KEY, settings);
}

export function isSuggestReady(settings: SuggestSettings): boolean {
	return settings.enabled && settings.apiKey.trim() !== "";
}

export function watchSuggestSettings(
	cb: (settings: SuggestSettings) => void,
): () => void {
	return storage.watch<Partial<SuggestSettings>>(KEY, (saved) =>
		cb({ ...DEFAULTS, ...saved }),
	);
}
