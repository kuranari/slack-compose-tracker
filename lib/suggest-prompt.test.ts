import type Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import {
	resultOf,
	suggestionView,
	suggestUserContent,
} from "@/lib/suggest-prompt";

const message = (
	content: unknown[],
	stop_reason = "end_turn",
): Anthropic.Beta.BetaMessage =>
	({ content, stop_reason }) as unknown as Anthropic.Beta.BetaMessage;

it("下書きを draft タグで囲んで渡す", () => {
	expect(suggestUserContent("こんにちは")).toBe(
		"書きかけのメッセージ:\n<draft>\nこんにちは\n</draft>",
	);
});

it("テキストのブロックをつなげた JSON から文案と指摘を取り出す", () => {
	const result = resultOf(
		message([
			{ type: "thinking", thinking: "" },
			{ type: "text", text: '{"draft": " **結論**: A です\\n- 理由 ",' },
			{ type: "text", text: ' "points": ["結論を先に", 1]}' },
		]),
	);
	expect(result).toEqual({
		ok: true,
		draft: "**結論**: A です\n- 理由",
		points: ["結論を先に"],
	});
});

it("JSON として読めなければエラーにする", () => {
	expect(
		resultOf(message([{ type: "text", text: '{"draft": "途中' }])).ok,
	).toBe(false);
});

it("断られたらエラーにする", () => {
	expect(resultOf(message([], "refusal")).ok).toBe(false);
});

it("文案が空ならエラーにする", () => {
	expect(
		resultOf(message([{ type: "text", text: '{"draft": " ", "points": []}' }]))
			.ok,
	).toBe(false);
});

it("パネルには文案の下に指摘を並べる", () => {
	expect(suggestionView({ draft: "文案", points: ["一", "二"] })).toBe(
		"文案\n\n――\n・一\n・二",
	);
	expect(suggestionView({ draft: "文案", points: [] })).toBe("文案");
});
