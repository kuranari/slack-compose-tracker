import { describe, expect, it } from "vitest";
import type { ComposeRecord } from "../lib/compose-record.ts";
import {
	type Draft,
	groupStats,
	heaviestRewrites,
	quantile,
	summarizeGroups,
} from "./aggregate.ts";
import { makeRecord } from "./fixtures.ts";
import { draftMetrics } from "./metrics.ts";

const draft = (
	texts: string[],
	overrides: Partial<ComposeRecord> = {},
): Draft => {
	const record = makeRecord(
		texts.map((text, i) => ({ at: i * 10_000, text })),
		overrides,
	);
	return { record, metrics: draftMetrics(record) };
};

describe("quantile", () => {
	it("線形補間で分位点を返す", () => {
		expect(quantile([3, 1, 2], 0.5)).toBe(2);
		expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
		expect(quantile([0, 10], 0.9)).toBe(9);
	});

	it("空なら NaN", () => {
		expect(quantile([], 0.5)).toBeNaN();
	});
});

describe("groupStats", () => {
	it("削除ありと前の文の修正ありの割合を数える", () => {
		const stats = groupStats("x", [
			draft(["abc", "abcdef"]),
			draft(["abc", "abX"]),
			draft(["明日です", "今週です"]),
		]);
		expect(stats.count).toBe(3);
		expect(stats.withDeletionShare).toBeCloseTo(2 / 3);
		expect(stats.withMidEditShare).toBeCloseTo(1 / 3);
	});
});

describe("summarizeGroups", () => {
	it("送信/破棄とチャンネル/スレッドに分け、0 件の切り口も残す", () => {
		const groups = summarizeGroups([
			draft(["a"]),
			draft(["b", ""], { outcome: "discarded" }),
		]);
		expect(groups.map((g) => [g.label, g.count])).toEqual([
			["全体", 2],
			["送信", 1],
			["破棄", 1],
			["チャンネル", 2],
			["スレッド", 0],
		]);
	});
});

describe("heaviestRewrites", () => {
	it("削除文字数の多い順に上位 N 件を返し、削除のないものは除く", () => {
		const small = draft(["abc", "abX"]);
		const large = draft(["abcdefgh", "a"]);
		const none = draft(["abc", "abcdef"]);
		expect(heaviestRewrites([small, none, large], 5)).toEqual([large, small]);
		expect(heaviestRewrites([small, none, large], 1)).toEqual([large]);
	});
});
