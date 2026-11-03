import type Anthropic from "@anthropic-ai/sdk";
import { expect, it } from "vitest";
import { resultOf, suggestUserContent } from "@/lib/suggest-prompt";

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

it("テキストのブロックだけをつなげて返す", () => {
	const result = resultOf(
		message([
			{ type: "thinking", thinking: "" },
			{ type: "text", text: "文案: A\n" },
			{ type: "text", text: "ポイント: B\n" },
		]),
	);
	expect(result).toEqual({ ok: true, text: "文案: A\nポイント: B" });
});

it("断られたらエラーにする", () => {
	expect(resultOf(message([], "refusal")).ok).toBe(false);
});

it("テキストが空ならエラーにする", () => {
	expect(resultOf(message([{ type: "text", text: "  " }])).ok).toBe(false);
});
