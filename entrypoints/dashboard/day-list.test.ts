import { describe, expect, it } from "vitest";
import type { ComposeRecord } from "@/lib/compose-record";
import {
	excerpt,
	formatClock,
	formatDateTime,
	summarizeDay,
	toDayRows,
} from "./day-list";

// ローカル時刻で作る (表示もローカル時刻なので、実行環境のタイムゾーンに依存しない)
const at = (h: number, m: number, s = 0) =>
	new Date(2026, 9, 30, h, m, s).getTime();

const record = (overrides: Partial<ComposeRecord> = {}): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt: at(10, 0),
	endedAt: at(10, 1, 30),
	durationMs: 90_000,
	inputCount: 12,
	length: 5,
	outcome: "sent",
	text: "hello",
	snapshots: [{ at: 0, text: "h" }],
	...overrides,
});

describe("formatClock / formatDateTime", () => {
	it("ローカル時刻を 0 埋めで表示する", () => {
		expect(formatClock(at(9, 5, 7))).toBe("09:05");
		expect(formatDateTime(at(9, 5, 7))).toBe("2026-10-30 09:05:07");
	});
});

describe("excerpt", () => {
	it("改行と連続する空白を 1 つの空白にする", () => {
		expect(excerpt("  一行目\n\n二行目\tです ")).toBe("一行目 二行目 です");
	});

	it("上限を超えたら切って … を付ける", () => {
		expect(excerpt("あいうえお", 3)).toBe("あいう…");
		expect(excerpt("あいう", 3)).toBe("あいう");
	});

	it("絵文字を途中で割らない", () => {
		expect(excerpt("👍👍👍", 2)).toBe("👍👍…");
	});
});

describe("toDayRows", () => {
	it("開始時刻順に並べて表示用に整形する", () => {
		const rows = toDayRows([
			record({ startedAt: at(11, 0), channelId: "C2", outcome: "discarded" }),
			record({
				startedAt: at(9, 30),
				durationMs: 754_000,
				pane: "thread",
				text: "長い\n本文",
			}),
		]);
		expect(rows).toEqual([
			{
				startedAt: at(9, 30),
				startTime: "09:30",
				duration: "12:34",
				outcome: "sent",
				pane: "thread",
				channelId: "C1",
				excerpt: "長い 本文",
			},
			{
				startedAt: at(11, 0),
				startTime: "11:00",
				duration: "1:30",
				outcome: "discarded",
				pane: "channel",
				channelId: "C2",
				excerpt: "hello",
			},
		]);
	});

	it("text の無い古い記録でも落ちない", () => {
		const old = record();
		delete (old as Partial<ComposeRecord>).text;
		expect(toDayRows([old])[0]?.excerpt).toBe("");
	});
});

describe("summarizeDay", () => {
	it("合計・最長は送信分のみ、破棄は件数だけ数える", () => {
		expect(
			summarizeDay([
				record({ durationMs: 1_000 }),
				record({ durationMs: 5_000 }),
				record({ durationMs: 60_000, outcome: "discarded" }),
			]),
		).toEqual({
			sentCount: 2,
			totalMs: 6_000,
			longestMs: 5_000,
			discardedCount: 1,
		});
	});

	it("空の日", () => {
		expect(summarizeDay([])).toEqual({
			sentCount: 0,
			totalMs: 0,
			longestMs: 0,
			discardedCount: 0,
		});
	});
});
