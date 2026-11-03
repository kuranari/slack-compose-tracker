// 絵文字の <img> が持つ表記の候補。どの属性に載るかは Slack の版で変わりうるので、
// ":pray:" の形のものを優先し、無ければ最初に見つかった値 (Unicode の絵文字など) を使う
const EMOJI_ATTRS = [
	"data-stringify-emoji",
	"data-stringify-text",
	"data-id",
	"alt",
] as const;
const SHORTCODE = /^:[^\s:]+:$/;

export function emojiText(img: Pick<Element, "getAttribute">): string {
	const values = EMOJI_ATTRS.map((attr) =>
		img.getAttribute(attr)?.trim(),
	).filter((v): v is string => !!v);
	return values.find((v) => SHORTCODE.test(v)) ?? values[0] ?? "";
}
