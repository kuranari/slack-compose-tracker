import Anthropic from "@anthropic-ai/sdk";
import { isSaveRecordMessage, isSuggestMessage } from "@/lib/messages";
import { appendRecord } from "@/lib/record-store";
import {
	resultOf,
	SUGGEST_FORMAT,
	SUGGEST_MODEL,
	SUGGEST_SYSTEM,
	type SuggestResult,
	suggestUserContent,
} from "@/lib/suggest-prompt";
import { getSuggestSettings, isSuggestReady } from "@/lib/suggest-settings";

const errorMessage = (err: unknown): string => {
	if (err instanceof Anthropic.AuthenticationError)
		return "API キーが正しくありません";
	if (err instanceof Anthropic.RateLimitError)
		return "混み合っています。少し待ってください";
	if (err instanceof Anthropic.APIError)
		return `API エラー (${err.status ?? "通信"})`;
	return String(err);
};

async function suggest(draft: string): Promise<SuggestResult> {
	const settings = await getSuggestSettings();
	if (!isSuggestReady(settings)) {
		return {
			ok: false,
			error: "オプション画面で AI の提案を有効にしてください",
		};
	}
	// キーは自分の端末の storage にあり、外に配らないのでブラウザからの直接呼び出しを許す
	const client = new Anthropic({
		apiKey: settings.apiKey,
		dangerouslyAllowBrowser: true,
	});
	try {
		const message = await client.beta.messages.create({
			model: SUGGEST_MODEL,
			max_tokens: 16000,
			output_config: { effort: "low", format: SUGGEST_FORMAT },
			// 安全性の判定で断られたら、サーバー側で別のモデルにやり直させる
			betas: ["server-side-fallback-2026-07-01"],
			fallbacks: "default",
			system: SUGGEST_SYSTEM,
			messages: [{ role: "user", content: suggestUserContent(draft) }],
		});
		return resultOf(message);
	} catch (err) {
		return { ok: false, error: errorMessage(err) };
	}
}

export default defineBackground(() => {
	browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (isSaveRecordMessage(message)) {
			appendRecord(message.record).catch((err: unknown) =>
				console.error("[slack-compose-tracker] save failed", err),
			);
			return;
		}
		if (isSuggestMessage(message)) {
			suggest(message.draft)
				.catch(
					(err: unknown): SuggestResult => ({
						ok: false,
						error: errorMessage(err),
					}),
				)
				.then(sendResponse);
			// 非同期に応答するため、チャンネルを開けたままにする
			return true;
		}
	});
});
