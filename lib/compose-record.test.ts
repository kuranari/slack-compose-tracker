import { describe, expect, it } from "vitest";
import { type ComposeRecord, summarize, toCsv } from "@/lib/compose-record";

const record = (overrides: Partial<ComposeRecord> = {}): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt: Date.UTC(2026, 9, 29, 10, 0, 0),
	endedAt: Date.UTC(2026, 9, 29, 10, 1, 30),
	durationMs: 90_000,
	inputCount: 12,
	length: 10,
	outcome: "sent",
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

describe("toCsv", () => {
	it("ヘッダと行を出力し、スレッドでなければ threadTs は空欄", () => {
		expect(toCsv([record()]).split("\n")).toEqual([
			"startedAt,endedAt,durationSec,outcome,pane,teamId,channelId,threadTs,length,inputCount",
			"2026-10-29T10:00:00.000Z,2026-10-29T10:01:30.000Z,90,sent,channel,T1,C1,,10,12",
		]);
	});
});
