import { describe, expect, it } from "vitest";
import {
	type ComposeRecord,
	dayKey,
	summarize,
	toCsv,
	toJsonl,
} from "@/lib/compose-record";

const record = (overrides: Partial<ComposeRecord> = {}): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt: Date.UTC(2026, 9, 29, 10, 0, 0),
	endedAt: Date.UTC(2026, 9, 29, 10, 1, 30),
	durationMs: 90_000,
	inputCount: 12,
	length: 5,
	outcome: "sent",
	text: "hello",
	snapshots: [{ at: 0, text: "h" }],
	...overrides,
});

describe("summarize", () => {
	it("件数・合計・最長を集計する", () => {
		expect(
			summarize([record({ durationMs: 1_000 }), record({ durationMs: 5_000 })]),
		).toEqual({ count: 2, totalMs: 6_000, longestMs: 5_000 });
	});

	it("空なら 0", () => {
		expect(summarize([])).toEqual({ count: 0, totalMs: 0, longestMs: 0 });
	});
});

describe("dayKey", () => {
	it("ローカル時刻の日付を YYYY-MM-DD で返す", () => {
		expect(dayKey(new Date(2026, 0, 2, 23, 59).getTime())).toBe("2026-01-02");
	});
});

describe("toCsv", () => {
	it("ヘッダと行を出力し、スレッドでなければ threadTs は空欄", () => {
		expect(toCsv([record()]).split("\n")).toEqual([
			"startedAt,endedAt,durationSec,outcome,pane,teamId,teamName,channelId,channelName,threadTs,length,inputCount,text",
			"2026-10-29T10:00:00.000Z,2026-10-29T10:01:30.000Z,90,sent,channel,T1,,C1,,,5,12,hello",
		]);
	});

	it("本文の改行・カンマ・ダブルクォートをエスケープする", () => {
		const [, row] = toCsv([record({ text: 'a,"b"\nc' })]).split(/\n(?=2026)/);
		expect(row?.endsWith(',"a,""b""\nc"')).toBe(true);
	});
});

describe("toJsonl", () => {
	it("1 行に 1 件、文字の履歴を含めて出力する", () => {
		const lines = toJsonl([record(), record({ text: "bye" })]).split("\n");
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0] ?? "")).toEqual(record());
	});
});
