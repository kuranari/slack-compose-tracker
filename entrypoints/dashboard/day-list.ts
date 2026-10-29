// 1 日分の記録を一覧表示用の行と要約に変換する (純粋関数のみ。DOM は main.ts 側)
import {
	type ComposeOutcome,
	type ComposeRecord,
	type Pane,
	summarize,
} from "@/lib/compose-record";
import { formatDuration } from "@/lib/duration";

export type DayRow = {
	// 詳細画面へのリンクに使う。同じ日の中で記録を特定するキー
	startedAt: number;
	startTime: string;
	duration: string;
	outcome: ComposeOutcome;
	pane: Pane;
	channelId: string;
	excerpt: string;
};

export type DaySummary = {
	sentCount: number;
	totalMs: number;
	longestMs: number;
	discardedCount: number;
};

const EXCERPT_LENGTH = 80;

const pad = (n: number) => String(n).padStart(2, "0");

// ローカル時刻の "HH:MM"
export function formatClock(timestamp: number): string {
	const d = new Date(timestamp);
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ローカル時刻の "YYYY-MM-DD HH:MM:SS"
export function formatDateTime(timestamp: number): string {
	const d = new Date(timestamp);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 表のセルを 1 行に収めるため、改行を含む空白の連続を 1 つの空白に潰してから切る
export function excerpt(text: string, max = EXCERPT_LENGTH): string {
	const flat = text.replace(/\s+/g, " ").trim();
	const chars = Array.from(flat);
	return chars.length > max ? `${chars.slice(0, max).join("")}…` : flat;
}

// 保存は終了日ごとだが、読む順番は書いた順 (開始時刻) にする
export function sortByStart(
	records: readonly ComposeRecord[],
): ComposeRecord[] {
	return [...records].sort((a, b) => a.startedAt - b.startedAt);
}

export function toDayRows(records: readonly ComposeRecord[]): DayRow[] {
	return sortByStart(records).map((r) => ({
		startedAt: r.startedAt,
		startTime: formatClock(r.startedAt),
		duration: formatDuration(r.durationMs),
		outcome: r.outcome,
		pane: r.pane,
		channelId: r.channelId,
		// 初期版の記録には text が無い
		excerpt: excerpt(r.text ?? ""),
	}));
}

// 合計・最長は popup と同じく送信分だけで数える。破棄は件数だけ別に出す
export function summarizeDay(records: readonly ComposeRecord[]): DaySummary {
	const sent = summarize(records.filter((r) => r.outcome === "sent"));
	return {
		sentCount: sent.count,
		totalMs: sent.totalMs,
		longestMs: sent.longestMs,
		discardedCount: records.filter((r) => r.outcome === "discarded").length,
	};
}

export const OUTCOME_LABEL: Record<ComposeOutcome, string> = {
	sent: "送信",
	discarded: "破棄",
};

export const PANE_LABEL: Record<Pane, string> = {
	channel: "チャンネル",
	thread: "スレッド",
};
