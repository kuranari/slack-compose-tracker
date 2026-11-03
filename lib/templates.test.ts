import { expect, it } from "vitest";
import {
	filterTemplates,
	normalizeTemplates,
	type Template,
} from "@/lib/templates";

const t = (id: string, name: string, body: string): Template => ({
	id,
	name,
	body,
});

const templates = [
	t("1", "お礼", "**ありがとうございます**"),
	t("2", "日報", "- 今日やったこと\n- 明日やること"),
	t("3", "Review", "レビューお願いします"),
];

it("空の検索語ならすべて返す", () => {
	expect(filterTemplates(templates, " ")).toEqual(templates);
});

it("名前か本文に、すべての語を含むものを返す", () => {
	expect(filterTemplates(templates, "明日").map((x) => x.id)).toEqual(["2"]);
	expect(filterTemplates(templates, "日報 今日").map((x) => x.id)).toEqual([
		"2",
	]);
	expect(filterTemplates(templates, "日報 お礼")).toEqual([]);
});

it("大文字と小文字は区別しない", () => {
	expect(filterTemplates(templates, "review").map((x) => x.id)).toEqual(["3"]);
});

it("空の行は捨て、名前が空なら本文の 1 行目を名前にする", () => {
	expect(
		normalizeTemplates([
			t("1", " ", " "),
			t("2", "", " 一行目\n二行目 "),
			t("3", " 名前 ", "本文"),
		]),
	).toEqual([t("2", "一行目", "一行目\n二行目"), t("3", "名前", "本文")]);
});
