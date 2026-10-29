// 下書き 1 件ぶんの「書き直し」の指標。
// 履歴 (snapshots) は 10 秒間隔なので、間隔内で消して打ち直した分は見えない。
// ここでの削除量はすべて「少なくともこれだけは書き直した」という下限として扱う。
import type { ComposeRecord, Snapshot } from "../lib/compose-record.ts";
import { type DiffOp, diffText } from "./text-diff.ts";

// append: 末尾に書き足しただけ / tail-edit: 末尾を消して書き直した /
// mid-edit: 後ろの文を残したまま、前の文を直した (読み返して直す癖の目安)
export type StepKind = "append" | "tail-edit" | "mid-edit";

export type Step = {
	fromAt: number;
	toAt: number;
	kind: StepKind;
	ops: DiffOp[];
	inserted: number;
	deleted: number;
};

export type DraftMetrics = {
	durationMs: number;
	// 文字数はすべてコードポイント単位 (記録の length は UTF-16 単位なので絵文字でずれる)
	finalLength: number;
	insertedChars: number;
	deletedChars: number;
	// 消した量 / 最終的な長さ。1 なら「最終形と同じ量を一度書いて消した」
	rewriteRatio: number;
	deletionSteps: number;
	largestDeletion: number;
	midEditSteps: number;
	// 最終形 1 文字あたりにかけた時間。短文で時間がかかっているものを見つける
	msPerChar: number;
	steps: Step[];
};

const len = (s: string): number => Array.from(s).length;

export function classifyStep(ops: readonly DiffOp[]): StepKind {
	const lastEqual = ops.findLastIndex((op) => op.kind === "equal");
	const changedBeforeEqual = ops
		.slice(0, Math.max(0, lastEqual))
		.some((op) => op.kind !== "equal");
	if (changedBeforeEqual) return "mid-edit";
	return ops.some((op) => op.kind === "delete") ? "tail-edit" : "append";
}

const toStep = (from: Snapshot, to: Snapshot): Step => {
	const ops = diffText(from.text, to.text);
	const sum = (kind: DiffOp["kind"]) =>
		ops.filter((op) => op.kind === kind).reduce((n, op) => n + len(op.text), 0);
	return {
		fromAt: from.at,
		toAt: to.at,
		kind: classifyStep(ops),
		ops,
		inserted: sum("insert"),
		deleted: sum("delete"),
	};
};

// 空の入力欄 (at: 0) から始めることで、最初の履歴に入った文字も挿入として数え、
// 「挿入 − 削除 = 最終文字数」が常に成り立つようにする
export function toSteps(record: ComposeRecord): Step[] {
	const snapshots: Snapshot[] =
		record.snapshots.length > 0
			? record.snapshots
			: [{ at: record.durationMs, text: record.text }];
	const timeline: Snapshot[] = [{ at: 0, text: "" }, ...snapshots];
	return timeline.slice(1).flatMap((to, i) => {
		const from = timeline[i];
		return from && from.text !== to.text ? [toStep(from, to)] : [];
	});
}

export function draftMetrics(record: ComposeRecord): DraftMetrics {
	const steps = toSteps(record);
	const finalLength = len(record.text);
	const deletedChars = steps.reduce((n, s) => n + s.deleted, 0);
	const largestDeletion = Math.max(
		0,
		...steps.flatMap((s) =>
			s.ops.filter((op) => op.kind === "delete").map((op) => len(op.text)),
		),
	);
	return {
		durationMs: record.durationMs,
		finalLength,
		insertedChars: steps.reduce((n, s) => n + s.inserted, 0),
		deletedChars,
		rewriteRatio: deletedChars / Math.max(1, finalLength),
		deletionSteps: steps.filter((s) => s.deleted > 0).length,
		largestDeletion,
		midEditSteps: steps.filter((s) => s.kind === "mid-edit").length,
		msPerChar: record.durationMs / Math.max(1, finalLength),
		steps,
	};
}
