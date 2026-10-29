// ポップアップから書き出した JSONL を記録に戻す。
// 壊れた行で全体を止めず、読めた分だけで分析できるよう行ごとのエラーとして返す
import type { ComposeRecord } from "../lib/compose-record.ts";

export type ParseError = { line: number; message: string };

const isRecord = (v: unknown): v is ComposeRecord => {
	if (typeof v !== "object" || v === null) return false;
	const r = v as Record<string, unknown>;
	return (
		typeof r.startedAt === "number" &&
		typeof r.durationMs === "number" &&
		typeof r.text === "string" &&
		(r.outcome === "sent" || r.outcome === "discarded") &&
		(r.pane === "channel" || r.pane === "thread") &&
		Array.isArray(r.snapshots)
	);
};

export function parseJsonl(content: string): {
	records: ComposeRecord[];
	errors: ParseError[];
} {
	const records: ComposeRecord[] = [];
	const errors: ParseError[] = [];
	content.split(/\r?\n/).forEach((raw, i) => {
		if (raw.trim() === "") return;
		try {
			const value: unknown = JSON.parse(raw);
			if (isRecord(value)) {
				records.push(value);
			} else {
				errors.push({ line: i + 1, message: "記録の形式ではありません" });
			}
		} catch (e) {
			errors.push({ line: i + 1, message: (e as Error).message });
		}
	});
	return { records, errors };
}
