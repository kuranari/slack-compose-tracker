// 長引いた下書きを Claude に見てもらうための指示文と、応答の取り出し (docs/ai-suggest-design.md)
import type Anthropic from "@anthropic-ai/sdk";

export const SUGGEST_MODEL = "claude-opus-5-5";

export const SUGGEST_SYSTEM = `あなたは Slack のメッセージを書くのを手伝うアシスタントです。
ユーザーは、このメッセージを書き始めてから長い時間がたち、書き直しを繰り返して送れずにいます。
次の 2 つを、日本語で、Markdown を使わずに返してください。

1. 「文案:」に続けて、言いたいことを保ったまま短く直したメッセージ
2. 「ポイント:」に続けて、長引いていそうな理由と直し方を 3 つまで、1 行ずつ

元の文の口調 (敬語かくだけた言い方か) は変えないでください。`;

export function suggestUserContent(draft: string): string {
	return `書きかけのメッセージ:\n<draft>\n${draft}\n</draft>`;
}

export type SuggestResult =
	| { ok: true; text: string }
	| { ok: false; error: string };

export function resultOf(message: Anthropic.Beta.BetaMessage): SuggestResult {
	if (message.stop_reason === "refusal") {
		return { ok: false, error: "この下書きには提案できませんでした" };
	}
	const text = message.content
		.flatMap((block) => (block.type === "text" ? [block.text] : []))
		.join("")
		.trim();
	return text ? { ok: true, text } : { ok: false, error: "提案が空でした" };
}
