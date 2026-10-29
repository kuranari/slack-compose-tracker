// 入力欄の右上に経過時間を重ねて表示する。
// Slack のエディタ (Quill) の DOM に要素を差し込むと編集内容を壊しうるため、
// body 直下の Shadow DOM に fixed 配置し、入力欄の矩形に合わせて位置だけ追従させる。

const STYLE = `
	.badge {
		position: fixed;
		z-index: 9999;
		pointer-events: none;
		padding: 1px 6px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font: 11px/1.4 system-ui, sans-serif;
		font-variant-numeric: tabular-nums;
	}
`;

const RIGHT_INSET_PX = 8;

export type BadgeItem = {
	composer: HTMLElement;
	text: string;
};

export function createBadgeLayer() {
	const host = document.createElement("div");
	const root = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = STYLE;
	root.append(style);
	document.body.append(host);

	const badges = new Map<HTMLElement, HTMLElement>();

	const render = (items: readonly BadgeItem[]) => {
		const viewportWidth = document.documentElement.clientWidth;
		const visible = new Set<HTMLElement>();
		for (const { composer, text } of items) {
			let badge = badges.get(composer);
			if (!badge) {
				badge = document.createElement("div");
				badge.className = "badge";
				root.append(badge);
				badges.set(composer, badge);
			}
			const rect = composer.getBoundingClientRect();
			badge.textContent = text;
			badge.style.top = `${rect.top + 4}px`;
			badge.style.right = `${viewportWidth - rect.right + RIGHT_INSET_PX}px`;
			visible.add(composer);
		}
		for (const [composer, badge] of badges) {
			if (visible.has(composer)) continue;
			badge.remove();
			badges.delete(composer);
		}
	};

	const destroy = () => {
		host.remove();
		badges.clear();
	};

	return { render, destroy };
}
