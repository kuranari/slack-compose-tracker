import { describe, expect, it } from "vitest";
import {
	closeSession,
	type DraftContext,
	draftKey,
	MIN_DISCARD_MS,
	observeText,
	recordInput,
	SEND_WINDOW_MS,
	SNAPSHOT_INTERVAL_MS,
	shouldSave,
} from "@/lib/draft-session";

const channel: DraftContext = {
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
};
const thread: DraftContext = {
	teamId: "T1",
	channelId: "C1",
	threadTs: "1700000000.000100",
	pane: "thread",
};

describe("draftKey", () => {
	it("チャンネルとスレッドで別のキーになる", () => {
		expect(draftKey(channel)).toBe("T1/C1");
		expect(draftKey(thread)).toBe("T1/C1/1700000000.000100");
	});
});

describe("recordInput", () => {
	it("最初の入力で開始時刻と最初の履歴を記録し、以降は開始時刻を維持する", () => {
		const first = recordInput(undefined, 1_000, "a");
		const second = recordInput(first, 5_000, "abc");
		expect(second).toEqual({
			startedAt: 1_000,
			lastInputAt: 5_000,
			inputCount: 2,
			text: "abc",
			snapshots: [{ at: 0, text: "a" }],
			rawSnapshots: [{ at: 0, text: "a" }],
		});
	});
});

describe("observeText", () => {
	const start = recordInput(undefined, 0, "a");

	it("間隔に満たなければ本文だけ更新し、履歴は増やさない", () => {
		const s = observeText(start, SNAPSHOT_INTERVAL_MS - 1, "ab");
		expect(s.text).toBe("ab");
		expect(s.snapshots).toHaveLength(1);
	});

	it("間隔を過ぎて本文が変わっていれば履歴に追加する", () => {
		const s = observeText(start, SNAPSHOT_INTERVAL_MS, "ab");
		expect(s.snapshots).toEqual([
			{ at: 0, text: "a" },
			{ at: SNAPSHOT_INTERVAL_MS, text: "ab" },
		]);
	});

	it("間隔を過ぎても本文が同じなら履歴に追加しない", () => {
		const s = observeText(start, SNAPSHOT_INTERVAL_MS * 2, "a");
		expect(s.snapshots).toHaveLength(1);
	});

	it("間隔は直前の履歴から数える", () => {
		const s1 = observeText(start, SNAPSHOT_INTERVAL_MS, "ab");
		const s2 = observeText(s1, SNAPSHOT_INTERVAL_MS * 2 - 1, "abc");
		const s3 = observeText(s2, SNAPSHOT_INTERVAL_MS * 2, "abcd");
		expect(s2.snapshots).toHaveLength(2);
		expect(s3.snapshots.map((x) => x.text)).toEqual(["a", "ab", "abcd"]);
	});
});

describe("IME で変換中の入力", () => {
	it("変換中に始まった下書きは、開始時刻は記録するが最初の履歴は取らない", () => {
		const s = recordInput(undefined, 1_000, "に", true);
		expect(s.startedAt).toBe(1_000);
		expect(s.snapshots).toEqual([]);
	});

	it("変換中は間隔を過ぎても履歴を取らず、本文だけ更新する", () => {
		const start = recordInput(undefined, 0, "a");
		const s = observeText(start, SNAPSHOT_INTERVAL_MS, "aにほんご", true);
		expect(s.text).toBe("aにほんご");
		expect(s.snapshots).toEqual([{ at: 0, text: "a" }]);
	});

	it("確定後の最初の観測で、見送った履歴を取る", () => {
		const start = recordInput(undefined, 0, "a");
		const composing = observeText(
			start,
			SNAPSHOT_INTERVAL_MS,
			"aにほんご",
			true,
		);
		const committed = observeText(
			composing,
			SNAPSHOT_INTERVAL_MS + 2_000,
			"a日本語",
		);
		expect(committed.snapshots).toEqual([
			{ at: 0, text: "a" },
			{ at: SNAPSHOT_INTERVAL_MS + 2_000, text: "a日本語" },
		]);
	});

	it("最初の履歴が無ければ、確定後は間隔を待たずにすぐ取る", () => {
		const s0 = recordInput(undefined, 0, "に", true);
		const s1 = observeText(s0, 500, "日本", false);
		expect(s1.snapshots).toEqual([{ at: 500, text: "日本" }]);
	});

	it("変換中も含む履歴 (raw) は、変換中かどうかに関係なく間隔どおりに取る", () => {
		const s0 = recordInput(undefined, 0, "に", true);
		const s1 = observeText(s0, SNAPSHOT_INTERVAL_MS, "にほんご", true);
		const s2 = observeText(s1, SNAPSHOT_INTERVAL_MS + 500, "日本語", false);
		expect(s2.rawSnapshots).toEqual([
			{ at: 0, text: "に" },
			{ at: SNAPSHOT_INTERVAL_MS, text: "にほんご" },
		]);
		// 確定だけの履歴は確定後すぐに取る
		expect(s2.snapshots).toEqual([
			{ at: SNAPSHOT_INTERVAL_MS + 500, text: "日本語" },
		]);
	});

	it("締めると両方の履歴の末尾に最終形が入る", () => {
		const s0 = recordInput(undefined, 0, "に", true);
		const s1 = recordInput(s0, 1_000, "日本");
		const record = closeSession(s1, channel, 3_000, 2_000);
		expect(record.snapshots).toEqual([{ at: 2_000, text: "日本" }]);
		expect(record.rawSnapshots).toEqual([
			{ at: 0, text: "に" },
			{ at: 2_000, text: "日本" },
		]);
	});
});

describe("closeSession", () => {
	const session = recordInput(
		recordInput(undefined, 1_000, "a"),
		4_000,
		"abcd",
	);

	it("送信操作の直後に空になったら送信とし、送信操作の時刻で締める", () => {
		const record = closeSession(session, thread, 6_500, 6_000);
		expect(record).toEqual({
			teamId: "T1",
			channelId: "C1",
			threadTs: "1700000000.000100",
			pane: "thread",
			startedAt: 1_000,
			endedAt: 6_000,
			durationMs: 5_000,
			inputCount: 2,
			length: 4,
			outcome: "sent",
			text: "abcd",
			snapshots: [
				{ at: 0, text: "a" },
				{ at: 5_000, text: "abcd" },
			],
			rawSnapshots: [
				{ at: 0, text: "a" },
				{ at: 5_000, text: "abcd" },
			],
		});
	});

	it("送信操作が無ければ破棄とし、観測時刻で締める", () => {
		const record = closeSession(session, channel, 6_500, undefined);
		expect(record).toMatchObject({ outcome: "discarded", endedAt: 6_500 });
		expect(record).not.toHaveProperty("threadTs");
	});

	it("送信操作から猶予を過ぎて空になったら破棄とする", () => {
		const record = closeSession(
			session,
			channel,
			6_000 + SEND_WINDOW_MS + 1,
			6_000,
		);
		expect(record.outcome).toBe("discarded");
	});

	it("下書き開始より前の送信操作は前の下書きのものなので無視する", () => {
		const record = closeSession(session, channel, 6_500, 500);
		expect(record.outcome).toBe("discarded");
	});

	it("最終形が直前の履歴と同じなら履歴を重複させない", () => {
		const unchanged = recordInput(undefined, 1_000, "a");
		const record = closeSession(unchanged, channel, 2_000, 1_500);
		expect(record.snapshots).toEqual([{ at: 0, text: "a" }]);
	});
});

describe("shouldSave", () => {
	const session = recordInput(undefined, 1_000, "あ");

	it("すぐに消した破棄は残さない", () => {
		const record = closeSession(
			session,
			thread,
			1_000 + MIN_DISCARD_MS - 1,
			undefined,
		);
		expect(shouldSave(record)).toBe(false);
	});

	it("しばらく書いてから消した破棄は残す", () => {
		const record = closeSession(
			session,
			thread,
			1_000 + MIN_DISCARD_MS,
			undefined,
		);
		expect(shouldSave(record)).toBe(true);
	});

	it("送信はすぐでも残す", () => {
		const record = closeSession(session, thread, 1_600, 1_500);
		expect(shouldSave(record)).toBe(true);
	});
});
