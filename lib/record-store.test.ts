import { beforeEach, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { ComposeRecord } from "@/lib/compose-record";
import { appendRecord, getRecords } from "@/lib/record-store";

const record = (startedAt: number): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt,
	endedAt: startedAt + 1_000,
	durationMs: 1_000,
	inputCount: 1,
	length: 1,
	outcome: "sent",
});

beforeEach(() => {
	fakeBrowser.reset();
});

it("同時に追記しても取りこぼさず、順序を保つ", async () => {
	await Promise.all([1, 2, 3].map((n) => appendRecord(record(n))));
	const records = await getRecords();
	expect(records.map((r) => r.startedAt)).toEqual([1, 2, 3]);
});
