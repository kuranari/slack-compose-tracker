// 永続化する記録の型と、記録に対する純粋な集計・変換

export type Pane = "channel" | "thread";

export type ComposeOutcome = "sent" | "discarded";

export type ComposeRecord = {
	teamId: string;
	channelId: string;
	threadTs?: string;
	pane: Pane;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	inputCount: number;
	length: number;
	outcome: ComposeOutcome;
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

export function startOfDay(now: number): number {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

const CSV_COLUMNS = [
	"startedAt",
	"endedAt",
	"durationSec",
	"outcome",
	"pane",
	"teamId",
	"channelId",
	"threadTs",
	"length",
	"inputCount",
] as const;

const csvCell = (value: string | number | undefined): string => {
	const s = value === undefined ? "" : String(value);
	return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(records: readonly ComposeRecord[]): string {
	const rows = records.map((r) =>
		[
			new Date(r.startedAt).toISOString(),
			new Date(r.endedAt).toISOString(),
			Math.round(r.durationMs / 1000),
			r.outcome,
			r.pane,
			r.teamId,
			r.channelId,
			r.threadTs,
			r.length,
			r.inputCount,
		]
			.map(csvCell)
			.join(","),
	);
	return [CSV_COLUMNS.join(","), ...rows].join("\n");
}
