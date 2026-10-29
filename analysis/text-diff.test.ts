import { describe, expect, it } from "vitest";
import { diffText } from "./text-diff.ts";

describe("diffText", () => {
	it("末尾への書き足しは equal + insert になる", () => {
		expect(diffText("おはよう", "おはようございます")).toEqual([
			{ kind: "equal", text: "おはよう" },
			{ kind: "insert", text: "ございます" },
		]);
	});

	it("途中の置換は削除を先に並べ、前後を equal で挟む", () => {
		expect(diffText("明日やります。", "今週やります。")).toEqual([
			{ kind: "delete", text: "明日" },
			{ kind: "insert", text: "今週" },
			{ kind: "equal", text: "やります。" },
		]);
	});

	it("離れた複数箇所の変更を別々の塊として返す", () => {
		expect(diffText("abcXdefYghi", "abcdefghi")).toEqual([
			{ kind: "equal", text: "abc" },
			{ kind: "delete", text: "X" },
			{ kind: "equal", text: "def" },
			{ kind: "delete", text: "Y" },
			{ kind: "equal", text: "ghi" },
		]);
	});

	it("サロゲートペアの絵文字を分割しない", () => {
		expect(diffText("👍", "👀")).toEqual([
			{ kind: "delete", text: "👍" },
			{ kind: "insert", text: "👀" },
		]);
	});

	it("同じ文字列なら equal のみ、空同士なら空", () => {
		expect(diffText("abc", "abc")).toEqual([{ kind: "equal", text: "abc" }]);
		expect(diffText("", "")).toEqual([]);
	});

	it("差分から変更前と変更後の両方を復元できる", () => {
		const before = "了解です、明日の会議で共有します";
		const after = "承知しました。明後日の定例で共有します!";
		const ops = diffText(before, after);
		const rebuild = (skip: string) =>
			ops
				.filter((op) => op.kind !== skip)
				.map((op) => op.text)
				.join("");
		expect(rebuild("insert")).toBe(before);
		expect(rebuild("delete")).toBe(after);
	});
});
