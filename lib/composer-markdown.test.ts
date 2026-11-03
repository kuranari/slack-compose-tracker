// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { composerMarkdown } from "@/lib/composer-markdown";

// Slack の入力欄で実際に見た DOM (2026-11-03) を元にしている
const md = (html: string) => {
	const el = document.createElement("div");
	el.innerHTML = html;
	return composerMarkdown(el);
};

it("書式のない段落は改行でつなぐ", () => {
	expect(md("<p>一行目</p><p>二行目</p>")).toBe("一行目\n二行目");
});

it("空の段落は空行になる", () => {
	expect(md("<p>前</p><p><br></p><p>後</p>")).toBe("前\n\n後");
});

it("太字・斜体・取り消し線・コード", () => {
	expect(
		md(
			"<p>普通 <strong>太字</strong> <em>斜体</em> <s>取消</s> <code>c</code></p>",
		),
	).toBe("普通 **太字** _斜体_ ~~取消~~ `c`");
});

it("記号の内側の空白は外に出す", () => {
	expect(md("<p>a<strong> 太字 </strong>b</p>")).toBe("a **太字** b");
});

it("中身が空の書式は記号を付けない", () => {
	expect(md("<p>a<strong></strong>b</p>")).toBe("ab");
});

it("箇条書きと番号付きリスト", () => {
	expect(
		md(
			"<ul><li>箇条1</li><li>箇条2</li></ul><ol><li>番号1</li><li>番号2</li></ol>",
		),
	).toBe("- 箇条1\n- 箇条2\n1. 番号1\n2. 番号2");
});

it("入れ子のリストは字下げし、番号は深さごとに数える", () => {
	expect(
		md(
			'<ol><li>一</li><li class="ql-indent-1">子1</li><li class="ql-indent-1">子2</li><li>二</li><li class="ql-indent-1">子3</li></ol>',
		),
	).toBe("1. 一\n   1. 子1\n   2. 子2\n2. 二\n   1. 子3");
});

it("引用", () => {
	expect(md("<blockquote><s>取消</s> 引用</blockquote>")).toBe(
		"> ~~取消~~ 引用",
	);
});

it("連続するコードブロックの行は 1 つのフェンスにまとめる", () => {
	expect(
		md(
			'<p>前</p><div class="ql-code-block">const a = 1;</div><div class="ql-code-block">a++;</div><p>後</p>',
		),
	).toBe("前\n```\nconst a = 1;\na++;\n```\n後");
});

it("リンクは文字と URL が違うときだけ Markdown のリンクにする", () => {
	expect(
		md(
			'<p><a href="https://example.com">リンク</a> と <a href="https://example.com/raw">https://example.com/raw</a></p>',
		),
	).toBe("[リンク](https://example.com) と https://example.com/raw");
});

it("絵文字は :name: の表記、メンションは表示名のまま", () => {
	expect(
		md(
			'<p>ありがとう<img data-id=":pray:" alt="🙏"> <ts-mention data-label="@someone">@someone</ts-mention></p>',
		),
	).toBe("ありがとう:pray: @someone");
});

it("ゼロ幅スペースと前後の空行は除く", () => {
	expect(md("<p>​</p><p>本文​</p><p><br></p>")).toBe("本文");
});
