// 入力欄 (Quill) の DOM を Markdown に直す。innerText では太字やリストが落ちるため。
// Slack は Markdown のテキストを貼り付けると書式に戻すので、記録をそのまま貼れば同じ見た目になる
// (2026-11-03 に確認、docs/compose-tracking-design.md)。対応する DOM:
//   <strong> <em> <s> <code> <a>、<ul>/<ol> の <li class="ql-indent-N">、
//   <blockquote>、<div class="ql-code-block"> (1 行ずつ)、絵文字の <img>
import { emojiText } from "@/lib/emoji-text";

const ZWSP = /​/g;
const INDENT = /\bql-indent-(\d+)\b/;

// "** 太字**" は Markdown として解釈されないので、前後の空白は記号の外に出す
const wrap = (marker: string, inner: string): string => {
	const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
	const [, lead = "", core = "", trail = ""] = match ?? [];
	return core ? `${lead}${marker}${core}${marker}${trail}` : inner;
};

const INLINE_MARKERS: Record<string, string> = {
	STRONG: "**",
	B: "**",
	EM: "_",
	I: "_",
	S: "~~",
	STRIKE: "~~",
	DEL: "~~",
	CODE: "`",
};

function inline(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return (node.textContent ?? "").replace(ZWSP, "");
	}
	if (!(node instanceof Element)) return "";
	if (node.tagName === "BR") return "\n";
	if (node.tagName === "IMG") return emojiText(node);
	const inner = Array.from(node.childNodes, inline).join("");
	const marker = INLINE_MARKERS[node.tagName];
	if (marker) return wrap(marker, inner);
	if (node.tagName === "A") {
		const href = node.getAttribute("href");
		return href && inner && inner !== href ? `[${inner}](${href})` : inner;
	}
	return inner;
}

const indentOf = (el: Element): number =>
	Number(INDENT.exec(el.className)?.[1] ?? 0);

function list(el: Element): string[] {
	const ordered = el.tagName === "OL";
	// 深さごとの番号。浅い項目に戻ったら、それより深い番号は振り直す
	const counters: number[] = [];
	return Array.from(el.children, (li) => {
		const depth = indentOf(li);
		counters.length = depth + 1;
		counters[depth] = (counters[depth] ?? 0) + 1;
		const marker = ordered ? `${counters[depth]}. ` : "- ";
		return `${"   ".repeat(depth)}${marker}${inline(li)}`;
	});
}

const isCodeLine = (node: Node | null): node is Element =>
	node instanceof Element && node.classList.contains("ql-code-block");

export function composerMarkdown(composer: Element): string {
	const lines: string[] = [];
	const nodes = Array.from(composer.childNodes);
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i] as Node;
		if (isCodeLine(node)) {
			lines.push("```");
			for (; i < nodes.length && isCodeLine(nodes[i] ?? null); i++) {
				lines.push((nodes[i]?.textContent ?? "").replace(ZWSP, ""));
			}
			i--;
			lines.push("```");
			continue;
		}
		if (
			node instanceof Element &&
			(node.tagName === "UL" || node.tagName === "OL")
		) {
			lines.push(...list(node));
			continue;
		}
		if (node instanceof Element && node.tagName === "BLOCKQUOTE") {
			lines.push(
				...inline(node)
					.split("\n")
					.map((line) => `> ${line}`),
			);
			continue;
		}
		if (node instanceof Element && node.tagName === "PRE") {
			lines.push("```", (node.textContent ?? "").replace(ZWSP, ""), "```");
			continue;
		}
		// <p> や地の文。<p><br></p> は空行になる
		const text = inline(node);
		lines.push(text === "\n" ? "" : text);
	}
	return lines.join("\n").trim();
}
