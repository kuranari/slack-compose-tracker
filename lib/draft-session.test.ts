import { describe, expect, it } from "vitest";
import {
	closeSession,
	type DraftContext,
	draftKey,
	recordInput,
	SEND_WINDOW_MS,
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
	it("最初の入力で開始時刻を記録し、以降は維持する", () => {
		const first = recordInput(undefined, 1_000, 1);
		const second = recordInput(first, 5_000, 3);
		expect(second).toEqual({
			startedAt: 1_000,
			lastInputAt: 5_000,
			inputCount: 2,
			length: 3,
		});
	});
});

describe("closeSession", () => {
	const session = recordInput(recordInput(undefined, 1_000, 1), 4_000, 4);

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
});
