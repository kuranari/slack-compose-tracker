import { describe, expect, it } from "vitest";
import type { ComposeRecord } from "@/lib/compose-record";
import {
	formatRatio,
	medianSentRatio,
	rewriteLevel,
	rewriteStats,
} from "./rewrite";

const record = (overrides: Partial<ComposeRecord> = {}): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt: 0,
	endedAt: 30_000,
	durationMs: 30_000,
	inputCount: 10,
	length: 5,
	outcome: "sent",
	text: "hello",
	snapshots: [{ at: 0, text: "hello" }],
	...overrides,
});

describe("rewriteStats", () => {
	it("消した文字数と最終文字数から書き直し率を出す", () => {
		const stats = rewriteStats(
			record({
				text: "hello",
				snapshots: [
					{ at: 0, text: "help me" },
					{ at: 10_000, text: "hello" },
				],
			}),
		);
		// "help me" → "hello": "p me" を消して "lo" を足す
		expect(stats).toMatchObject({ deletedChars: 4, ratio: 0.8 });
	});

	it("本文の無い記録は出さない", () => {
		expect(rewriteStats(record({ text: "" }))).toBeUndefined();
	});
});

describe("rewriteLevel", () => {
	const stats = (ratio: number, deletedChars: number) => ({
		ratio,
		deletedChars,
		midEditSteps: 0,
		largestDeletion: 0,
	});

	it.each([
		[0.49, 100, "normal"],
		[0.5, 100, "warn"],
		[0.99, 100, "warn"],
		[1.0, 100, "over"],
	])("率 %f・削除 %i 字 → %s", (ratio, deleted, expected) => {
		expect(rewriteLevel(stats(ratio, deleted))).toBe(expected);
	});

	it("削除が少ない短文は率が高くても色を付けない", () => {
		expect(rewriteLevel(stats(3, 19))).toBe("normal");
	});

	it("指標が無ければ normal", () => {
		expect(rewriteLevel(undefined)).toBe("normal");
	});
});

describe("formatRatio", () => {
	it("小数 2 桁にする。出せないときは -", () => {
		expect(formatRatio(1.456)).toBe("1.46");
		expect(formatRatio(undefined)).toBe("-");
		expect(formatRatio(Number.NaN)).toBe("-");
	});
});

describe("medianSentRatio", () => {
	it("送信した記録だけの中央値を取る", () => {
		const rewritten = (text: string, first: string) =>
			record({
				text,
				snapshots: [
					{ at: 0, text: first },
					{ at: 1, text },
				],
			});
		expect(
			medianSentRatio([
				rewritten("ab", "ab"), // 0
				rewritten("ab", "xab"), // 0.5
				rewritten("ab", "xxab"), // 1
				{ ...rewritten("ab", "xxxxab"), outcome: "discarded" },
			]),
		).toBe(0.5);
	});
});
