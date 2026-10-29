import { describe, expect, it } from "vitest";
import { makeRecord } from "./fixtures.ts";
import { draftMetrics } from "./metrics.ts";
import { renderOps, renderReport, renderTimeline } from "./report.ts";
import { diffText } from "./text-diff.ts";

const formatTime = (ms: number) => `t${ms}`;

describe("renderOps", () => {
	it("削除と挿入を [-旧-]{+新+} で表し、改行を記号にする", () => {
		expect(renderOps(diffText("明日やります", "今週\nやります"))).toBe(
			"[-明日-]{+今週⏎+}やります",
		);
	});

	it("長い前後の文脈は省略する", () => {
		const before = `${"あ".repeat(30)}X${"い".repeat(30)}`;
		const after = `${"あ".repeat(30)}Y${"い".repeat(30)}`;
		expect(renderOps(diffText(before, after))).toBe(
			`…${"あ".repeat(12)}[-X-]{+Y+}${"い".repeat(12)}…`,
		);
	});
});

describe("renderTimeline", () => {
	it("連続する書き足しは 1 行にまとめる", () => {
		const { steps } = draftMetrics(
			makeRecord([
				{ at: 0, text: "a" },
				{ at: 10_000, text: "ab" },
				{ at: 20_000, text: "abc" },
				{ at: 30_000, text: "aXc" },
			]),
		);
		expect(renderTimeline(steps, 10)).toEqual([
			" 0:00→0:20  append×3   (書き足しのみ +3)",
			" 0:20→0:30  mid-edit   a[-b-]{+X+}c",
		]);
	});

	it("上限を超えた行は省略を明記する", () => {
		const { steps } = draftMetrics(
			makeRecord([
				{ at: 0, text: "a" },
				{ at: 10_000, text: "b" },
				{ at: 20_000, text: "c" },
				{ at: 30_000, text: "d" },
			]),
		);
		const lines = renderTimeline(steps, 2);
		expect(lines).toHaveLength(3);
		expect(lines[2]).toBe("… (残り 2 行は省略)");
	});
});

describe("renderReport", () => {
	const records = [
		makeRecord([
			{ at: 0, text: "了" },
			{ at: 10_000, text: "了解です" },
		]),
		makeRecord(
			[
				{ at: 0, text: "明" },
				{ at: 10_000, text: "明日やります" },
				{ at: 20_000, text: "今週やります" },
			],
			{ startedAt: 1_700_000_100_000, pane: "thread" },
		),
	];

	it("分布の表・上位の表・タイムラインを含む", () => {
		const report = renderReport(records, { top: 5, formatTime });
		expect(report).toContain("- 期間: t1700000000000 〜 t1700000100000 / 2 件");
		expect(report).toContain("| スレッド | 1 |");
		expect(report).toContain("書き直しの多い下書き (削除文字数の上位 1 件)");
		expect(report).toContain("### #1 t1700000100000 送信 / スレッド");
		expect(report).toContain("[-明日-]{+今週+}やります");
	});

	it("記録がなくても壊れない", () => {
		const report = renderReport([], { top: 5, formatTime });
		expect(report).toContain("記録がありません");
		expect(report).toContain("削除を含む下書きはありません");
	});
});
