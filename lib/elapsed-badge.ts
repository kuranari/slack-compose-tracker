// 入力欄の右上に経過時間を重ねて表示する。
// Slack のエディタ (Quill) の DOM に要素を差し込むと編集内容を壊しうるため、
// body 直下の Shadow DOM に fixed 配置し、入力欄の矩形に合わせて位置だけ追従させる。
// バッジを押すと AI の提案をバッジの上のパネルに出す。長引いた下書きではバッジを目立たせて促す (docs/ai-suggest-design.md)
import type { ElapsedLevel } from "@/lib/duration";

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
	.badge[data-level="warn"] {
		background: #f5c518;
		color: #1d1c1d;
	}
	.badge[data-level="over"] {
		background: #e01e5a;
		color: #fff;
	}
	.badge[data-clickable] {
		pointer-events: auto;
		cursor: pointer;
	}
	/* いつでも押せるが、普段は控えめにし、長引いたら目立たせて押すよう促す */
	.badge[data-clickable]::after {
		content: " · AI";
		opacity: 0.7;
	}
	.badge[data-clickable]:not([data-level="normal"])::after {
		content: " · AI に聞く";
		opacity: 1;
		font-weight: bold;
	}
	.badge[data-clickable]:not([data-level="normal"]) {
		animation: nudge 1.2s ease-in-out 3;
	}
	@keyframes nudge {
		50% {
			transform: scale(1.15);
			box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.5);
		}
	}
	.panel {
		position: fixed;
		z-index: 9999;
		box-sizing: border-box;
		width: min(420px, calc(100vw - 32px));
		max-height: 50vh;
		overflow: auto;
		padding: 10px 12px;
		border-radius: 8px;
		background: #fff;
		color: #1d1c1d;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
		font: 13px/1.5 system-ui, sans-serif;
	}
	.panel-body {
		margin: 0 0 8px;
		white-space: pre-wrap;
	}
	.panel[data-state="error"] .panel-body {
		color: #e01e5a;
	}
	.panel-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	.panel button {
		font: inherit;
		padding: 2px 10px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f8f8f8;
		cursor: pointer;
	}
`;

const RIGHT_INSET_PX = 8;
const PANEL_GAP_PX = 6;

export type BadgeItem = {
	composer: HTMLElement;
	text: string;
	level: ElapsedLevel;
	clickable: boolean;
};

export type PanelState = "loading" | "done" | "error";

export function createBadgeLayer(
	onBadgeClick: (composer: HTMLElement) => void,
) {
	const host = document.createElement("div");
	const root = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = STYLE;
	root.append(style);
	document.body.append(host);

	const badges = new Map<HTMLElement, HTMLElement>();
	const composerOf = new WeakMap<HTMLElement, HTMLElement>();

	// 押しても入力欄からフォーカスを奪わないよう、mousedown の既定動作を止める
	root.addEventListener("mousedown", (e) => e.preventDefault());
	root.addEventListener("click", (e) => {
		const badge = (e.target as HTMLElement).closest?.(".badge");
		const composer = badge && composerOf.get(badge as HTMLElement);
		if (composer && (badge as HTMLElement).dataset.clickable !== undefined) {
			onBadgeClick(composer);
		}
	});

	const panel = document.createElement("div");
	panel.className = "panel";
	panel.hidden = true;
	const panelBody = document.createElement("p");
	panelBody.className = "panel-body";
	const copyButton = document.createElement("button");
	copyButton.type = "button";
	copyButton.textContent = "コピー";
	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.textContent = "閉じる";
	const actions = document.createElement("div");
	actions.className = "panel-actions";
	actions.append(copyButton, closeButton);
	panel.append(panelBody, actions);
	root.append(panel);

	let panelComposer: HTMLElement | null = null;

	const hidePanel = () => {
		panel.hidden = true;
		panelComposer = null;
	};
	closeButton.addEventListener("click", hidePanel);
	copyButton.addEventListener("click", () => {
		void navigator.clipboard.writeText(panelBody.textContent ?? "");
		copyButton.textContent = "コピーしました";
	});

	const showPanel = (
		composer: HTMLElement,
		state: PanelState,
		text: string,
	) => {
		panelComposer = composer;
		panel.dataset.state = state;
		panelBody.textContent = text;
		copyButton.hidden = state !== "done";
		copyButton.textContent = "コピー";
		panel.hidden = false;
	};

	const isPanelFor = (composer: HTMLElement) => panelComposer === composer;

	const render = (items: readonly BadgeItem[]) => {
		const viewportWidth = document.documentElement.clientWidth;
		const viewportHeight = document.documentElement.clientHeight;
		const visible = new Set<HTMLElement>();
		for (const { composer, text, level, clickable } of items) {
			let badge = badges.get(composer);
			if (!badge) {
				badge = document.createElement("div");
				badge.className = "badge";
				root.append(badge);
				badges.set(composer, badge);
				composerOf.set(badge, composer);
			}
			const rect = composer.getBoundingClientRect();
			const right = `${viewportWidth - rect.right + RIGHT_INSET_PX}px`;
			badge.textContent = text;
			badge.dataset.level = level;
			if (clickable) badge.dataset.clickable = "";
			else delete badge.dataset.clickable;
			badge.style.top = `${rect.top + 4}px`;
			badge.style.right = right;
			if (composer === panelComposer) {
				// 入力欄は画面の下にあるので、パネルは入力欄の上に開く
				panel.style.bottom = `${viewportHeight - rect.top + PANEL_GAP_PX}px`;
				panel.style.right = right;
			}
			visible.add(composer);
		}
		for (const [composer, badge] of badges) {
			if (visible.has(composer)) continue;
			badge.remove();
			badges.delete(composer);
		}
		// 送信や破棄で下書きが終わったら、その提案も閉じる
		if (panelComposer && !visible.has(panelComposer)) hidePanel();
	};

	const destroy = () => {
		host.remove();
		badges.clear();
	};

	return { render, showPanel, hidePanel, isPanelFor, destroy };
}
