// AI との会話に貼って読ませる前提の Markdown レポート。
// 全件を載せると長すぎて読み手 (人も AI も) が要点を拾えないので、
// 全体の分布 + 書き直しの多い上位 N 件のタイムラインに絞り、本文も切り詰める。
import type { ComposeRecord } from "../lib/compose-record.ts";
import {
	type Distribution,
	type Draft,
	type GroupStats,
	heaviestRewrites,
	summarizeGroups,
} from "./aggregate.ts";
import { draftMetrics, type Step } from "./metrics.ts";
import type { DiffOp } from "./text-diff.ts";

export type ReportOptions = {
	top: number;
	// 1 件のタイムラインの最大行数
	maxStepLines?: number;
	// テストでタイムゾーンに依存しないよう差し替えられるようにする
	formatTime?: (epochMs: number) => string;
};

const DEFAULT_MAX_STEP_LINES = 20;
// 変更箇所の前後に残す文脈の文字数
const CONTEXT_CHARS = 12;
// 1 つの挿入/削除や最終本文を表示する上限
const MAX_CHANGE_CHARS = 80;
const MAX_FINAL_CHARS = 200;

const pad2 = (n: number) => String(n).padStart(2, "0");

export const formatLocalTime = (epochMs: number): string => {
	const d = new Date(epochMs);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// lib/duration.ts と同じ表記。lib は @/ エイリアスを使うため Node から実行時 import できず、ここで持つ
const formatElapsed = (ms: number): string => {
	const totalSec = Math.max(0, Math.round(ms / 1000));
	const m = Math.floor(totalSec / 60);
	return `${m}:${pad2(totalSec % 60)}`;
};

const formatSec = (ms: number): string =>
	Number.isNaN(ms) ? "-" : `${(ms / 1000).toFixed(0)}s`;
const formatSecPrecise = (ms: number): string =>
	Number.isNaN(ms) ? "-" : `${(ms / 1000).toFixed(1)}s`;
const formatNum = (n: number, digits = 0): string =>
	Number.isNaN(n) ? "-" : n.toFixed(digits);
const formatPct = (n: number): string =>
	Number.isNaN(n) ? "-" : `${Math.round(n * 100)}%`;

// 改行をそのまま出すとタイムラインの 1 行 = 1 ステップが崩れるため記号にする
const visible = (s: string): string => s.replaceAll(/\r?\n/g, "⏎");

const clip = (s: string, max: number): string => {
	const cs = Array.from(s);
	if (cs.length <= max) return s;
	const half = Math.floor(max / 2);
	return `${cs.slice(0, half).join("")}…${cs.slice(cs.length - half).join("")}`;
};

const head = (s: string, n: number): string => {
	const cs = Array.from(s);
	return cs.length <= n ? s : `${cs.slice(0, n).join("")}…`;
};

const tail = (s: string, n: number): string => {
	const cs = Array.from(s);
	return cs.length <= n ? s : `…${cs.slice(cs.length - n).join("")}`;
};

export function renderOps(ops: readonly DiffOp[]): string {
	return ops
		.map((op, i) => {
			if (op.kind === "delete") return `[-${clip(op.text, MAX_CHANGE_CHARS)}-]`;
			if (op.kind === "insert") return `{+${clip(op.text, MAX_CHANGE_CHARS)}+}`;
			if (i === 0) return tail(op.text, CONTEXT_CHARS);
			if (i === ops.length - 1) return head(op.text, CONTEXT_CHARS);
			return clip(op.text, CONTEXT_CHARS * 2);
		})
		.map(visible)
		.join("");
}

const stepLine = (from: number, to: number, label: string, body: string) =>
	`${formatElapsed(from).padStart(5)}→${formatElapsed(to).padEnd(5)} ${label.padEnd(10)} ${body}`;

// 書き足しが続く区間は 1 行にまとめる。注目したいのは消した/直した箇所なので
export function renderTimeline(
	steps: readonly Step[],
	maxLines: number,
): string[] {
	const lines: string[] = [];
	let i = 0;
	while (i < steps.length) {
		const step = steps[i];
		if (!step) break;
		let j = i;
		while (steps[j + 1]?.kind === "append" && step.kind === "append") j++;
		const last = steps[j] ?? step;
		if (j > i) {
			const inserted = steps
				.slice(i, j + 1)
				.reduce((n, s) => n + s.inserted, 0);
			lines.push(
				stepLine(
					step.fromAt,
					last.toAt,
					`append×${j - i + 1}`,
					`(書き足しのみ +${inserted})`,
				),
			);
		} else {
			lines.push(
				stepLine(step.fromAt, step.toAt, step.kind, renderOps(step.ops)),
			);
		}
		i = j + 1;
	}
	if (lines.length <= maxLines) return lines;
	return [
		...lines.slice(0, maxLines),
		`… (残り ${lines.length - maxLines} 行は省略)`,
	];
}

const dist = (d: Distribution, f: (n: number) => string) =>
	`${f(d.median)} / ${f(d.p90)}`;

const summaryTable = (groups: readonly GroupStats[]): string[] => [
	"| 切り口 | 件数 | 所要時間 | 最終文字数 | 1 字あたり | 削除文字数 | 書き直し率 | 削除あり | 前の文を修正 |",
	"| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
	...groups.map((g) => {
		const cells = [
			g.label,
			g.count,
			dist(g.durationMs, formatSec),
			dist(g.finalLength, (n) => formatNum(n)),
			dist(g.msPerChar, (ms) => formatSecPrecise(ms)),
			dist(g.deletedChars, (n) => formatNum(n)),
			dist(g.rewriteRatio, (n) => formatNum(n, 2)),
			formatPct(g.withDeletionShare),
			formatPct(g.withMidEditShare),
		];
		return `| ${cells.join(" | ")} |`;
	}),
];

const outcomeLabel = (r: ComposeRecord) =>
	r.outcome === "sent" ? "送信" : "破棄";
const paneLabel = (r: ComposeRecord) =>
	r.pane === "channel" ? "チャンネル" : "スレッド";

const ranking = (
	drafts: readonly Draft[],
	fmt: (ms: number) => string,
): string[] => [
	"| # | 開始 | 結果 | 場所 | 所要 | 最終文字数 | 削除 | 書き直し率 | 削除のあった回数 | 最大削除 | 前の文を修正 |",
	"| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
	...drafts.map(
		({ record: r, metrics: m }, i) =>
			`| ${i + 1} | ${fmt(r.startedAt)} | ${outcomeLabel(r)} | ${paneLabel(r)} | ${formatElapsed(m.durationMs)} | ${m.finalLength} | ${m.deletedChars} | ${formatNum(m.rewriteRatio, 2)} | ${m.deletionSteps} 回 | ${m.largestDeletion} | ${m.midEditSteps} 回 |`,
	),
];

const detail = (
	{ record: r, metrics: m }: Draft,
	rank: number,
	fmt: (ms: number) => string,
	maxLines: number,
): string[] => [
	`### #${rank} ${fmt(r.startedAt)} ${outcomeLabel(r)} / ${paneLabel(r)} (${formatElapsed(m.durationMs)}, +${m.insertedChars} -${m.deletedChars})`,
	"",
	// 本文に ``` が含まれても崩れにくいよう ~~~ で囲む
	"~~~",
	`最終: ${visible(clip(r.text, MAX_FINAL_CHARS))}`,
	...renderTimeline(m.steps, maxLines),
	"~~~",
	"",
];

export function renderReport(
	records: readonly ComposeRecord[],
	options: ReportOptions,
): string {
	const fmt = options.formatTime ?? formatLocalTime;
	const maxLines = options.maxStepLines ?? DEFAULT_MAX_STEP_LINES;
	const drafts: Draft[] = records
		.toSorted((a, b) => a.startedAt - b.startedAt)
		.map((record) => ({ record, metrics: draftMetrics(record) }));
	const first = drafts[0]?.record;
	const last = drafts.at(-1)?.record;
	const top = heaviestRewrites(drafts, options.top);
	const stepCounts = { append: 0, "tail-edit": 0, "mid-edit": 0 };
	for (const d of drafts) {
		for (const s of d.metrics.steps) stepCounts[s.kind]++;
	}
	return [
		"# 書き直し分析レポート",
		"",
		first && last
			? `- 期間: ${fmt(first.startedAt)} 〜 ${fmt(last.startedAt)} / ${drafts.length} 件`
			: "- 記録がありません",
		`- 履歴の変化 (約 10 秒ごと) の内訳: 書き足し ${stepCounts.append} / 末尾の書き直し ${stepCounts["tail-edit"]} / 前の文の修正 ${stepCounts["mid-edit"]}`,
		"- 履歴は約 10 秒間隔のため、間隔内で消して打ち直した分は数えられない (削除量は下限)",
		"",
		"## 切り口ごとの分布 (中央値 / p90)",
		"",
		...summaryTable(summarizeGroups(drafts)),
		"",
		`## 書き直しの多い下書き (削除文字数の上位 ${top.length} 件)`,
		"",
		...(top.length > 0 ? ranking(top, fmt) : ["削除を含む下書きはありません"]),
		"",
		"## タイムライン",
		"",
		"表記: `経過→経過 種類 差分`。`[-消した文字-]{+足した文字+}`、`⏎` は改行、`…` は省略。",
		"種類: append = 末尾への書き足し / tail-edit = 末尾を消して書き直し / mid-edit = 前の文の修正",
		"",
		...top.flatMap((d, i) => detail(d, i + 1, fmt, maxLines)),
	].join("\n");
}
