import { describe, expect, it } from "vitest";
import { makeRecord } from "./fixtures.ts";
import { classifyStep, draftMetrics, toSteps } from "./metrics.ts";
import { diffText } from "./text-diff.ts";

describe("classifyStep", () => {
	it("末尾に足しただけなら append", () => {
		expect(classifyStep(diffText("abc", "abcdef"))).toBe("append");
	});

	it("末尾を消して書き直したら tail-edit", () => {
		expect(classifyStep(diffText("abcxyz", "abcdef"))).toBe("tail-edit");
	});

	it("後ろを残して前を直したら mid-edit", () => {
		expect(classifyStep(diffText("明日やります", "今週やります"))).toBe(
			"mid-edit",
		);
	});

	it("前を直しつつ末尾にも足したら mid-edit", () => {
		expect(classifyStep(diffText("abc def", "abX def ghi"))).toBe("mid-edit");
	});
});

describe("toSteps", () => {
	it("空の入力欄から始め、変化のない履歴は飛ばす", () => {
		const steps = toSteps(
			makeRecord([
				{ at: 0, text: "a" },
				{ at: 10_000, text: "a" },
				{ at: 20_000, text: "ab" },
			]),
		);
		expect(steps.map((s) => [s.fromAt, s.toAt, s.kind])).toEqual([
			[0, 0, "append"],
			[10_000, 20_000, "append"],
		]);
	});

	it("履歴が空の記録は最終本文だけで扱う", () => {
		const steps = toSteps(makeRecord([], { text: "hi", durationMs: 5_000 }));
		expect(steps).toHaveLength(1);
		expect(steps[0]?.inserted).toBe(2);
	});
});

describe("draftMetrics", () => {
	const m = draftMetrics(
		makeRecord([
			{ at: 0, text: "明" },
			{ at: 10_000, text: "明日やります。よろしく" },
			{ at: 20_000, text: "今週やります。" },
			{ at: 25_000, text: "今週やります。お願いします" },
		]),
	);

	it("挿入 − 削除 = 最終文字数になる", () => {
		expect(m.insertedChars - m.deletedChars).toBe(m.finalLength);
		expect(m.finalLength).toBe(13);
	});

	it("削除量・削除のあった回数・最大の削除・前の文の修正回数を数える", () => {
		// 20s 時点で「明日」→「今週」(2) と「よろしく」(4) を消している
		expect(m.deletedChars).toBe(6);
		expect(m.deletionSteps).toBe(1);
		expect(m.largestDeletion).toBe(4);
		expect(m.midEditSteps).toBe(1);
	});

	it("書き直し率と 1 文字あたりの時間は最終文字数で割る", () => {
		expect(m.rewriteRatio).toBeCloseTo(6 / 13);
		expect(m.msPerChar).toBeCloseTo(25_000 / 13);
	});

	it("最終本文が空の記録 (実際の記録では起きない) でも 0 除算しない", () => {
		const discarded = draftMetrics(
			makeRecord(
				[
					{ at: 0, text: "abc" },
					{ at: 10_000, text: "" },
				],
				{ outcome: "discarded" },
			),
		);
		expect(discarded.finalLength).toBe(0);
		expect(discarded.deletedChars).toBe(3);
		expect(discarded.rewriteRatio).toBe(3);
	});
});
