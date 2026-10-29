import { describe, expect, it } from "vitest";
import { type DiffSegment, diffChars, diffStats } from "./char-diff";

// 差分を before / after に戻せること (どんな入力でも成り立つべき性質)
const restore = (segments: DiffSegment[]) => ({
	before: segments
		.filter((s) => s.type !== "insert")
		.map((s) => s.text)
		.join(""),
	after: segments
		.filter((s) => s.type !== "delete")
		.map((s) => s.text)
		.join(""),
});

describe("diffChars", () => {
	it("同じテキストは equal のみ", () => {
		expect(diffChars("abc", "abc")).toEqual([{ type: "equal", text: "abc" }]);
	});

	it("空から始まる場合は全体が挿入", () => {
		expect(diffChars("", "こんにちは")).toEqual([
			{ type: "insert", text: "こんにちは" },
		]);
	});

	it("全部消した場合は全体が削除", () => {
		expect(diffChars("abc", "")).toEqual([{ type: "delete", text: "abc" }]);
	});

	it("両方空なら空配列", () => {
		expect(diffChars("", "")).toEqual([]);
	});

	it("末尾への追記", () => {
		expect(diffChars("お疲れ", "お疲れ様です")).toEqual([
			{ type: "equal", text: "お疲れ" },
			{ type: "insert", text: "様です" },
		]);
	});

	it("途中の置換は削除 → 挿入の順", () => {
		expect(diffChars("明日やります", "今日やります")).toEqual([
			{ type: "delete", text: "明" },
			{ type: "insert", text: "今" },
			{ type: "equal", text: "日やります" },
		]);
	});

	it("離れた複数箇所の変更", () => {
		const segments = diffChars("abcdef", "aXcdeYf");
		expect(segments).toEqual([
			{ type: "equal", text: "a" },
			{ type: "delete", text: "b" },
			{ type: "insert", text: "X" },
			{ type: "equal", text: "cde" },
			{ type: "insert", text: "Y" },
			{ type: "equal", text: "f" },
		]);
	});

	it("絵文字 (サロゲートペア) を割らない", () => {
		const segments = diffChars("👍", "👎");
		expect(segments).toEqual([
			{ type: "delete", text: "👍" },
			{ type: "insert", text: "👎" },
		]);
	});

	it.each([
		["kitten", "sitting"],
		["改行\nあり", "改行\nなし\n追加"],
		["abcabba", "cbabac"],
	])("%j → %j を復元できる", (before, after) => {
		expect(restore(diffChars(before, after))).toEqual({ before, after });
	});

	it("長すぎる場合は全置換に倒す", () => {
		const before = `x${"a".repeat(2000)}`;
		const after = `y${"b".repeat(2000)}`;
		const segments = diffChars(before, after);
		expect(segments.map((s) => s.type)).toEqual(["delete", "insert"]);
		expect(restore(segments)).toEqual({ before, after });
	});
});

describe("diffStats", () => {
	it("挿入・削除の文字数を数える", () => {
		expect(diffStats(diffChars("明日やります👍", "今日やりました"))).toEqual({
			inserted: 3,
			deleted: 3,
		});
	});
});
