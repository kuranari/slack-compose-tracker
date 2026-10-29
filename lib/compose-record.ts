// 永続化する記録の型と、記録に対する純粋な集計・変換

export type Pane = "channel" | "thread";

export type ComposeOutcome = "sent" | "discarded";

// 下書き開始からの経過 ms と、その時点の全文
export type Snapshot = {
	at: number;
	text: string;
};

export type ComposeRecord = {
	teamId: string;
	channelId: string;
	// 下書きを締めた時点の表示名。取れなかった場合や初期版の記録には無い
	teamName?: string;
	channelName?: string;
	threadTs?: string;
	pane: Pane;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	inputCount: number;
	length: number;
	outcome: ComposeOutcome;
	// 送信または破棄の直前に入力欄にあった全文
	text: string;
	// IME で確定した文字だけの履歴 (分析・再生の既定)
	snapshots: Snapshot[];
	// 変換中の未確定文字も含む履歴。確定だけの履歴と比べるために並行して残す。
	// 2026-10-30 より前の記録には無い
	rawSnapshots?: Snapshot[];
};

export type Summary = {
	count: number;
	totalMs: number;
	longestMs: number;
};

export function summarize(records: readonly ComposeRecord[]): Summary {
	return records.reduce<Summary>(
		(acc, r) => ({
			count: acc.count + 1,
			totalMs: acc.totalMs + r.durationMs,
			longestMs: Math.max(acc.longestMs, r.durationMs),
		}),
		{ count: 0, totalMs: 0, longestMs: 0 },
	);
}

// 表示用。名前が無ければ ID で代用する
export const teamLabel = (r: ComposeRecord): string => r.teamName ?? r.teamId;
export const channelLabel = (r: ComposeRecord): string =>
	r.channelName ?? r.channelId;

// ローカル時刻での日付 (例: "2026-10-30")。保存キーと「今日」の判定に使う
export function dayKey(timestamp: number): string {
	const d = new Date(timestamp);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CSV_COLUMNS = [
	"startedAt",
	"endedAt",
	"durationSec",
	"outcome",
	"pane",
	"teamId",
	"teamName",
	"channelId",
	"channelName",
	"threadTs",
	"length",
	"inputCount",
	"text",
] as const;

const csvCell = (value: string | number | undefined): string => {
	const s = value === undefined ? "" : String(value);
	return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

// 文字の履歴 (snapshots) は列にしづらいので CSV には含めない。分析には JSONL を使う
export function toCsv(records: readonly ComposeRecord[]): string {
	const rows = records.map((r) =>
		[
			new Date(r.startedAt).toISOString(),
			new Date(r.endedAt).toISOString(),
			Math.round(r.durationMs / 1000),
			r.outcome,
			r.pane,
			r.teamId,
			r.teamName,
			r.channelId,
			r.channelName,
			r.threadTs,
			r.length,
			r.inputCount,
			r.text,
		]
			.map(csvCell)
			.join(","),
	);
	return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

export function toJsonl(records: readonly ComposeRecord[]): string {
	return records.map((r) => JSON.stringify(r)).join("\n");
}
