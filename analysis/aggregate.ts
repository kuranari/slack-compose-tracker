// 下書きごとの指標を、送信/破棄・チャンネル/スレッドの切り口でまとめる
import type { ComposeRecord } from "../lib/compose-record.ts";
import type { DraftMetrics } from "./metrics.ts";

export type Draft = { record: ComposeRecord; metrics: DraftMetrics };

export type Distribution = { median: number; p90: number };

export type GroupStats = {
	label: string;
	count: number;
	durationMs: Distribution;
	finalLength: Distribution;
	msPerChar: Distribution;
	deletedChars: Distribution;
	rewriteRatio: Distribution;
	// 1 文字でも削除した下書きの割合
	withDeletionShare: number;
	// 前の文を直した (mid-edit がある) 下書きの割合
	withMidEditShare: number;
};

// 線形補間の分位点。件数が少なくても値が飛びにくいので nearest-rank より読みやすい
export function quantile(values: readonly number[], q: number): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	const a = sorted[lo] ?? Number.NaN;
	const b = sorted[hi] ?? Number.NaN;
	return a + (b - a) * (pos - lo);
}

const distribution = (values: readonly number[]): Distribution => ({
	median: quantile(values, 0.5),
	p90: quantile(values, 0.9),
});

const share = (drafts: readonly Draft[], pred: (d: Draft) => boolean) =>
	drafts.length === 0 ? Number.NaN : drafts.filter(pred).length / drafts.length;

export function groupStats(
	label: string,
	drafts: readonly Draft[],
): GroupStats {
	const pick = (f: (m: DraftMetrics) => number) =>
		distribution(drafts.map((d) => f(d.metrics)));
	return {
		label,
		count: drafts.length,
		durationMs: pick((m) => m.durationMs),
		finalLength: pick((m) => m.finalLength),
		msPerChar: pick((m) => m.msPerChar),
		deletedChars: pick((m) => m.deletedChars),
		rewriteRatio: pick((m) => m.rewriteRatio),
		withDeletionShare: share(drafts, (d) => d.metrics.deletedChars > 0),
		withMidEditShare: share(drafts, (d) => d.metrics.midEditSteps > 0),
	};
}

// 件数 0 の切り口も残す。「スレッドでは 0 件」も読み手にとっては情報なので
export function summarizeGroups(drafts: readonly Draft[]): GroupStats[] {
	const by = (pred: (r: ComposeRecord) => boolean) =>
		drafts.filter((d) => pred(d.record));
	return [
		groupStats("全体", drafts),
		groupStats(
			"送信",
			by((r) => r.outcome === "sent"),
		),
		groupStats(
			"破棄",
			by((r) => r.outcome === "discarded"),
		),
		groupStats(
			"チャンネル",
			by((r) => r.pane === "channel"),
		),
		groupStats(
			"スレッド",
			by((r) => r.pane === "thread"),
		),
	];
}

// 率ではなく削除量で並べる。率だと 2 文字のメッセージで 1 文字直しただけのものが上位を占めるため
export function heaviestRewrites(
	drafts: readonly Draft[],
	top: number,
): Draft[] {
	return drafts
		.filter((d) => d.metrics.deletedChars > 0)
		.toSorted(
			(a, b) =>
				b.metrics.deletedChars - a.metrics.deletedChars ||
				b.metrics.rewriteRatio - a.metrics.rewriteRatio,
		)
		.slice(0, top);
}
