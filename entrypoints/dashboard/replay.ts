// スナップショットのリプレイ。各ステップと直前との差分を先に計算しておき、
// 描画側はインデックスを動かすだけで済むようにする
import type { ComposeRecord } from "@/lib/compose-record";
import { type DiffSegment, diffChars, diffStats } from "./char-diff";

export type ReplayStep = {
	// 下書き開始からの経過 ms
	at: number;
	text: string;
	// 直前のステップ (最初のステップは空文字) との差分
	diff: DiffSegment[];
	inserted: number;
	deleted: number;
};

export function buildSteps(record: ComposeRecord): ReplayStep[] {
	// 初期版の記録には snapshots / text が無い
	const snapshots = [...(record.snapshots ?? [])];
	const finalText = record.text ?? "";
	// 記録側で最終テキストも入れているはずだが、欠けていても最後は送信/破棄時の全文で終える
	const last = snapshots.at(-1);
	if (finalText !== "" && last?.text !== finalText) {
		snapshots.push({ at: record.durationMs, text: finalText });
	}

	let prev = "";
	return snapshots.map(({ at, text }) => {
		const diff = diffChars(prev, text);
		prev = text;
		return { at, text, diff, ...diffStats(diff) };
	});
}

// 再生中の次のインデックス。末尾に達したら null (= 停止)
export function nextIndex(index: number, length: number): number | null {
	return index + 1 < length ? index + 1 : null;
}

// 再生ボタンを押したときの開始位置。末尾で押されたら頭から再生し直す
export function playStartIndex(index: number, length: number): number {
	return index >= length - 1 ? 0 : index;
}

// ステップ一覧に「このステップで何を書いたか」を出すため、挿入された文字だけをつなげる
export function insertedText(step: ReplayStep): string {
	return step.diff
		.filter((s) => s.type === "insert")
		.map((s) => s.text)
		.join("");
}
