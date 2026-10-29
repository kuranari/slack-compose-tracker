import { beforeEach, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { type ComposeRecord, dayKey } from "@/lib/compose-record";
import {
	appendRecord,
	getAllRecords,
	getRecordsOfDay,
} from "@/lib/record-store";

const DAY1 = new Date(2026, 9, 29, 12).getTime();
const DAY2 = new Date(2026, 9, 30, 12).getTime();

const record = (endedAt: number, text = "x"): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt: endedAt - 1_000,
	endedAt,
	durationMs: 1_000,
	inputCount: 1,
	length: text.length,
	outcome: "sent",
	text,
	snapshots: [{ at: 0, text }],
});

beforeEach(() => {
	fakeBrowser.reset();
});

it("同時に追記しても取りこぼさず、順序を保つ", async () => {
	await Promise.all(["a", "b", "c"].map((t) => appendRecord(record(DAY1, t))));
	const records = await getRecordsOfDay(dayKey(DAY1));
	expect(records.map((r) => r.text)).toEqual(["a", "b", "c"]);
});

it("終了日ごとに分けて保存し、全期間は日付順に取り出せる", async () => {
	await appendRecord(record(DAY2, "later"));
	await appendRecord(record(DAY1, "earlier"));

	expect(await getRecordsOfDay(dayKey(DAY1))).toHaveLength(1);
	expect((await getAllRecords()).map((r) => r.text)).toEqual([
		"earlier",
		"later",
	]);
});
