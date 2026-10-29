// 下書き 1 件の「最初の入力 → 入力欄が空になる」までを追跡する純粋なドメインロジック。
// 経過時間の表示と記録は、どちらもこの startedAt を基準にする。
import type { ComposeRecord, Pane, Snapshot } from "@/lib/compose-record";

// 送信操作から入力欄が空になるまでの猶予。これを過ぎて空になったら破棄とみなす
export const SEND_WINDOW_MS = 3_000;

// 書き直しの癖を後から分析するための文字の履歴の間隔
export const SNAPSHOT_INTERVAL_MS = 10_000;

export type DraftContext = {
	teamId: string;
	channelId: string;
	threadTs?: string;
	pane: Pane;
};

export type DraftSession = {
	startedAt: number;
	lastInputAt: number;
	inputCount: number;
	text: string;
	snapshots: Snapshot[];
};

export function draftKey(ctx: DraftContext): string {
	return [ctx.teamId, ctx.channelId, ctx.threadTs]
		.filter((part) => part !== undefined)
		.join("/");
}

export function recordInput(
	session: DraftSession | undefined,
	now: number,
	text: string,
): DraftSession {
	if (!session) {
		return {
			startedAt: now,
			lastInputAt: now,
			inputCount: 1,
			text,
			snapshots: [{ at: 0, text }],
		};
	}
	return {
		...session,
		lastInputAt: now,
		inputCount: session.inputCount + 1,
		text,
	};
}

const appendSnapshot = (
	snapshots: readonly Snapshot[],
	at: number,
	text: string,
): Snapshot[] =>
	snapshots.at(-1)?.text === text
		? [...snapshots]
		: [...snapshots, { at, text }];

// 入力欄の現在の全文を観測する。input イベント以外 (補完など) での変化もここで拾う
export function observeText(
	session: DraftSession,
	now: number,
	text: string,
): DraftSession {
	const at = now - session.startedAt;
	const lastAt = session.snapshots.at(-1)?.at ?? 0;
	const snapshots =
		at - lastAt >= SNAPSHOT_INTERVAL_MS
			? appendSnapshot(session.snapshots, at, text)
			: session.snapshots;
	return { ...session, text, snapshots };
}

// 入力欄が空になったのを観測した時点で呼ぶ。直前に送信操作があれば送信とみなす
export function closeSession(
	session: DraftSession,
	ctx: DraftContext,
	now: number,
	pendingSendAt: number | undefined,
): ComposeRecord {
	const sent =
		pendingSendAt !== undefined &&
		pendingSendAt >= session.startedAt &&
		now - pendingSendAt <= SEND_WINDOW_MS;
	const endedAt = sent ? pendingSendAt : now;
	const durationMs = endedAt - session.startedAt;
	return {
		teamId: ctx.teamId,
		channelId: ctx.channelId,
		...(ctx.threadTs !== undefined && { threadTs: ctx.threadTs }),
		pane: ctx.pane,
		startedAt: session.startedAt,
		endedAt,
		durationMs,
		inputCount: session.inputCount,
		length: session.text.length,
		outcome: sent ? "sent" : "discarded",
		text: session.text,
		// 最終形も履歴の末尾に入れて、間隔の途中で終わった分を取りこぼさない
		snapshots: appendSnapshot(session.snapshots, durationMs, session.text),
	};
}
