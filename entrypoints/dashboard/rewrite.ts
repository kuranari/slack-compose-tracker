// 一覧・詳細に出す「書き直し」の指標 (純粋関数のみ)。計算は分析 CLI (analysis/metrics.ts) と共通にして、
// レポートとダッシュボードで値が食い違わないようにする
import { quantile } from "@/analysis/aggregate";
import { draftMetrics } from "@/analysis/metrics";
import type { ComposeRecord } from "@/lib/compose-record";

export type RewriteStats = {
	// 消した文字数 / 最終文字数。履歴は約 10 秒ごとなので、どれも「少なくとも」の値
	ratio: number;
	deletedChars: number;
	midEditSteps: number;
	largestDeletion: number;
};

export type RewriteLevel = "normal" | "warn" | "over";

// 書き直し率の目安。0.5 で黄、1.0 (最終形と同じ量を一度書いて消した) で赤
export const RATIO_WARN = 0.5;
export const RATIO_OVER = 1.0;
// 短文は数文字直しただけで率が跳ねるので、これより少ない削除は色を付けない
export const MIN_DELETED_FOR_LEVEL = 20;

// 初期版の記録には本文が無く、指標を出せない
export function rewriteStats(r: ComposeRecord): RewriteStats | undefined {
	if (!r.text) return undefined;
	const m = draftMetrics({ ...r, snapshots: r.snapshots ?? [] });
	return {
		ratio: m.rewriteRatio,
		deletedChars: m.deletedChars,
		midEditSteps: m.midEditSteps,
		largestDeletion: m.largestDeletion,
	};
}

export function rewriteLevel(stats: RewriteStats | undefined): RewriteLevel {
	if (!stats || stats.deletedChars < MIN_DELETED_FOR_LEVEL) return "normal";
	if (stats.ratio >= RATIO_OVER) return "over";
	if (stats.ratio >= RATIO_WARN) return "warn";
	return "normal";
}

export function formatRatio(ratio: number | undefined): string {
	return ratio === undefined || Number.isNaN(ratio) ? "-" : ratio.toFixed(2);
}

// 送信した下書きの書き直し率の中央値。指標を出せる記録が無ければ NaN
export function medianSentRatio(records: readonly ComposeRecord[]): number {
	const ratios = records
		.filter((r) => r.outcome === "sent")
		.flatMap((r) => {
			const s = rewriteStats(r);
			return s ? [s.ratio] : [];
		});
	return quantile(ratios, 0.5);
}
