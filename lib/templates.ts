// 定型文。全チャンネル共通で、端末ごとに保存する (docs/template-design.md)
export type Template = {
	id: string;
	name: string;
	// Markdown。Slack に貼り付けると書式に変わる
	body: string;
};

// 名前か本文に、空白で区切ったすべての語を含むものを残す。大文字と小文字は区別しない
export function filterTemplates(
	templates: readonly Template[],
	query: string,
): Template[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return templates.filter((t) => {
		const haystack = `${t.name}\n${t.body}`.toLowerCase();
		return words.every((w) => haystack.includes(w));
	});
}

// 名前も本文も空の行は、編集画面で消したものとして捨てる
export function normalizeTemplates(templates: readonly Template[]): Template[] {
	return templates
		.map((t) => ({ ...t, name: t.name.trim(), body: t.body.trim() }))
		.filter((t) => t.name || t.body)
		.map((t) => ({ ...t, name: t.name || t.body.split("\n")[0] || "" }));
}
