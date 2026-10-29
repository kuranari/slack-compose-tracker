// 下書き 1 件の「最初の入力 → 入力欄が空になる」までを追跡する純粋なドメインロジック。
// 経過時間の表示と記録は、どちらもこの startedAt を基準にする。
import type { ComposeRecord, Pane } from "@/lib/compose-record";

// 送信操作から入力欄が空になるまでの猶予。これを過ぎて空になったら破棄とみなす
export const SEND_WINDOW_MS = 3_000;

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
	length: number;
};

export function draftKey(ctx: DraftContext): string {
	return [ctx.teamId, ctx.channelId, ctx.threadTs]
		.filter((part) => part !== undefined)
		.join("/");
}

export function recordInput(
	session: DraftSession | undefined,
	now: number,
	length: number,
): DraftSession {
	if (!session) {
		return { startedAt: now, lastInputAt: now, inputCount: 1, length };
	}
	return {
		...session,
		lastInputAt: now,
		inputCount: session.inputCount + 1,
		length,
	};
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
	return {
		teamId: ctx.teamId,
		channelId: ctx.channelId,
		...(ctx.threadTs !== undefined && { threadTs: ctx.threadTs }),
		pane: ctx.pane,
		startedAt: session.startedAt,
		endedAt,
		durationMs: endedAt - session.startedAt,
		inputCount: session.inputCount,
		length: session.length,
		outcome: sent ? "sent" : "discarded",
	};
}
