// テスト用の合成記録。実データ (data/) は本文を含むのでテストには使わない
import type { ComposeRecord, Snapshot } from "../lib/compose-record.ts";

export function makeRecord(
	snapshots: Snapshot[],
	overrides: Partial<ComposeRecord> = {},
): ComposeRecord {
	const last = snapshots.at(-1) ?? { at: 0, text: "" };
	return {
		teamId: "T1",
		channelId: "C1",
		pane: "channel",
		startedAt: 1_700_000_000_000,
		endedAt: 1_700_000_000_000 + last.at,
		durationMs: last.at,
		inputCount: snapshots.length,
		length: last.text.length,
		outcome: "sent",
		text: last.text,
		snapshots,
		...overrides,
	};
}
