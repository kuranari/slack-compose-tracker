// 下書き 1 件の「最初の入力 → 入力欄が空になる」までを追跡する純粋なドメインロジック。
// 経過時間の表示と記録は、どちらもこの startedAt を基準にする。
import type { ComposeRecord, Pane, Snapshot } from "@/lib/compose-record";

// 送信操作から入力欄が空になるまでの猶予。これを過ぎて空になったら破棄とみなす
export const SEND_WINDOW_MS = 3_000;

// これより短く終わった破棄は記録しない。打ち始めてすぐ消した「あ」や「＠」のような断片で、
// 作成時間の分析には使えずノイズになるため
export const MIN_DISCARD_MS = 3_000;

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
	rawSnapshots: Snapshot[];
};

export function draftKey(ctx: DraftContext): string {
	return [ctx.teamId, ctx.channelId, ctx.threadTs]
		.filter((part) => part !== undefined)
		.join("/");
}

// composing: IME で変換中 (未確定の文字を含む) か。
// 履歴には確定済みの文字だけを残す。変換中の「にほんご」を残すと、次の履歴で「日本語」に
// 変わったときに、ただの変換が書き直し (削除＋挿入) として数えられてしまうため。
// 開始時刻は変換中でも最初のキー入力にする (変換中の入力も作成時間のうち)。
// どちらが癖を見るのに向くかまだ決めきれないので、変換中も含む履歴 (rawSnapshots) も
// 同じ間隔で並行して残し、後から比べられるようにしている
export function recordInput(
	session: DraftSession | undefined,
	now: number,
	text: string,
	composing = false,
): DraftSession {
	if (!session) {
		return {
			startedAt: now,
			lastInputAt: now,
			inputCount: 1,
			text,
			// 変換中に始まった下書きは、最初の履歴を確定後の observeText に任せる
			snapshots: composing ? [] : [{ at: 0, text }],
			rawSnapshots: [{ at: 0, text }],
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

// 間隔が来ていれば履歴に追加する。直前の履歴が無ければすぐ取る
const snapshotIfDue = (
	snapshots: Snapshot[],
	at: number,
	text: string,
): Snapshot[] => {
	const last = snapshots.at(-1);
	const due = !last || at - last.at >= SNAPSHOT_INTERVAL_MS;
	return due ? appendSnapshot(snapshots, at, text) : snapshots;
};

// 入力欄の現在の全文を観測する。input イベント以外 (補完など) での変化もここで拾う。
// 確定だけの履歴は、変換中は見送って確定後の最初の観測で取る (間隔はそのとき改めて判定する)。
// 変換中も含む履歴は、変換中かどうかに関係なく間隔どおりに取る
export function observeText(
	session: DraftSession,
	now: number,
	text: string,
	composing = false,
): DraftSession {
	const at = now - session.startedAt;
	return {
		...session,
		text,
		snapshots: composing
			? session.snapshots
			: snapshotIfDue(session.snapshots, at, text),
		rawSnapshots: snapshotIfDue(session.rawSnapshots, at, text),
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
		rawSnapshots: appendSnapshot(
			session.rawSnapshots,
			durationMs,
			session.text,
		),
	};
}

export function shouldSave(record: ComposeRecord): boolean {
	return record.outcome === "sent" || record.durationMs >= MIN_DISCARD_MS;
}
