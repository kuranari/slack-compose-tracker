// 長引いた下書きを Claude に見てもらうための指示文と、応答の取り出し (docs/ai-suggest-design.md)
import type Anthropic from "@anthropic-ai/sdk";

export const SUGGEST_MODEL = "claude-opus-5-5";

export const SUGGEST_SYSTEM = `あなたは Slack のメッセージを書くのを手伝うアシスタントです。
ユーザーは、このメッセージの書き方に迷っています。書き始めてから長い時間がたち、書き直しを繰り返していることもあります。
次の 2 つを日本語で返してください。

- draft: 言いたいことを保ったまま短く直したメッセージ
- points: 長引いていそうな理由と直し方。3 つまで、それぞれ 1 文で

下書きは Markdown で書かれています。draft も同じ Markdown で書き、元の太字・リスト・引用・コード・リンクは、
直したほうがよい場合を除いて残してください。Slack に貼ると書式に変わるので、使ってよいのは
**太字**、_斜体_、~~取り消し線~~、\`コード\`、\`\`\`コードブロック\`\`\`、- 箇条書き、1. 番号付きリスト、> 引用、[文字](URL) だけです。
見出しと表は使わないでください。

元の文の口調 (敬語かくだけた言い方か) は変えないでください。`;

// 文案だけをコピーできるよう、文案と指摘を分けて受け取る
export const SUGGEST_FORMAT = {
	type: "json_schema",
	schema: {
		type: "object",
		properties: {
			draft: { type: "string" },
			points: { type: "array", items: { type: "string" } },
		},
		required: ["draft", "points"],
		additionalProperties: false,
	},
} as const;

export function suggestUserContent(draft: string): string {
	return `書きかけのメッセージ:\n<draft>\n${draft}\n</draft>`;
}

export type SuggestOk = { ok: true; draft: string; points: string[] };
export type SuggestResult = SuggestOk | { ok: false; error: string };

export function resultOf(message: Anthropic.Beta.BetaMessage): SuggestResult {
	if (message.stop_reason === "refusal") {
		return { ok: false, error: "この下書きには提案できませんでした" };
	}
	const text = message.content
		.flatMap((block) => (block.type === "text" ? [block.text] : []))
		.join("");
	try {
		const { draft, points } = JSON.parse(text) as {
			draft?: unknown;
			points?: unknown;
		};
		if (typeof draft === "string" && draft.trim()) {
			return {
				ok: true,
				draft: draft.trim(),
				points: Array.isArray(points)
					? points.filter((p): p is string => typeof p === "string")
					: [],
			};
		}
	} catch {
		// 途中で切れた応答などは下でまとめてエラーにする
	}
	return { ok: false, error: "提案を読み取れませんでした" };
}

// パネルに出す文。コピーするのは文案だけ
export function suggestionView(result: { draft: string; points: string[] }) {
	const points = result.points.map((p) => `・${p}`).join("\n");
	return points ? `${result.draft}\n\n――\n${points}` : result.draft;
}
