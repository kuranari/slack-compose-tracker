// 入力欄の下の列 (送信ボタンの左) に、経過時間・AI・定型文のボタンを重ねて表示する。
// Slack のエディタ (Quill) やツールバーの DOM に要素を差し込むと、編集内容やボタンの畳み方を
// 壊しうるため、body 直下の Shadow DOM に fixed 配置し、列の矩形に合わせて位置だけ追従させる。
// 列に収まらないときは入力欄の右上に出す (docs/composer-ui-design.md)
import type { ElapsedLevel } from "@/lib/duration";
import { composerFooter } from "@/lib/slack-dom";
import { filterTemplates, type Template } from "@/lib/templates";

const STYLE = `
	:host {
		--icon: rgb(69, 68, 71);
		--icon-hover: rgba(29, 28, 29, 0.08);
	}
	/* button などに display を指定しているので、hidden 属性が効くように戻す */
	[hidden] {
		display: none !important;
	}
	.bar {
		position: fixed;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 2px;
		transform: translateY(-50%);
		font: 12px/1.4 system-ui, sans-serif;
	}
	.badge {
		padding: 1px 6px;
		border-radius: 4px;
		color: var(--icon);
		font-variant-numeric: tabular-nums;
		opacity: 0.8;
	}
	.badge[data-level="warn"] {
		background: #f5c518;
		color: #1d1c1d;
		opacity: 1;
	}
	.badge[data-level="over"] {
		background: #e01e5a;
		color: #fff;
		opacity: 1;
	}
	.bar button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 28px;
		height: 28px;
		padding: 2px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--icon);
		cursor: pointer;
	}
	.bar button:hover {
		background: var(--icon-hover);
	}
	.bar svg {
		width: 18px;
		height: 18px;
	}
	/* 長引いたら AI のボタンを目立たせて、押すよう促す */
	.bar[data-level="warn"] .ai,
	.bar[data-level="over"] .ai {
		color: #1d1c1d;
		background: #f5c518;
		animation: nudge 1.2s ease-in-out 3;
	}
	@keyframes nudge {
		50% {
			transform: scale(1.15);
			box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.5);
		}
	}
	.panel,
	.picker {
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
		user-select: text;
		cursor: text;
		outline: none;
	}
	.panel-note {
		margin: 0 0 6px;
		font-size: 12px;
		opacity: 0.7;
	}
	.panel[data-state="error"] .panel-body {
		color: #e01e5a;
	}
	.panel-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	.panel button,
	.picker button {
		font: inherit;
		padding: 2px 10px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f8f8f8;
		cursor: pointer;
	}
	.picker input {
		box-sizing: border-box;
		width: 100%;
		margin: 0 0 6px;
		padding: 4px 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
		font: inherit;
	}
	.picker ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.picker li {
		padding: 4px 8px;
		border-radius: 4px;
		cursor: pointer;
	}
	.picker li[aria-selected="true"] {
		background: #1264a3;
		color: #fff;
	}
	.picker .preview {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		opacity: 0.7;
		font-size: 12px;
	}
	.picker .empty {
		margin: 4px 0;
		opacity: 0.7;
	}
`;

// どちらも 18px の線のアイコン
const AI_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z"/><path d="M15.5 13l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/></svg>`;
const TEMPLATE_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="4" y="2.75" width="12" height="14.5" rx="2"/><path d="M7 7h6M7 10h6M7 13h3.5"/></svg>`;

const FOOTER_GAP_PX = 4;
const FALLBACK_INSET_PX = 8;
const PANEL_GAP_PX = 6;

export type OverlayItem = {
	composer: HTMLElement;
	// 下書きが無ければ経過時間を出さない
	elapsed: { text: string; level: ElapsedLevel } | null;
	// AI の提案を有効にしていて、下書きがあるとき
	canAsk: boolean;
};

export type PanelState = "loading" | "done" | "error";

export type OverlayHandlers = {
	// AI のボタン。前の提案があれば出し直すだけで、API は呼ばない
	onAsk: (composer: HTMLElement) => void;
	// パネルの「もう一度聞く」。こちらは必ず API を呼ぶ
	onRetry: (composer: HTMLElement) => void;
	onPickTemplate: (
		composer: HTMLElement,
		template: Template,
		range: Range | null,
	) => void;
	onOpenOptions: () => void;
	// 一覧を開く直前に、入力欄のカーソルの位置を覚える
	rangeOf: (composer: HTMLElement) => Range | null;
};

type Bar = {
	el: HTMLElement;
	badge: HTMLElement;
	ai: HTMLButtonElement;
	template: HTMLButtonElement;
};

const iconButton = (className: string, label: string, svg: string) => {
	const button = document.createElement("button");
	button.type = "button";
	button.className = className;
	button.title = label;
	button.setAttribute("aria-label", label);
	button.innerHTML = svg;
	return button;
};

export function createComposerOverlay(handlers: OverlayHandlers) {
	const host = document.createElement("div");
	const root = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = STYLE;
	root.append(style);
	document.body.append(host);

	const bars = new Map<HTMLElement, Bar>();
	let templates: Template[] = [];

	// ボタンを押しても入力欄からフォーカスを奪わないよう、mousedown の既定動作を止める。
	// 定型文の検索欄と、文字を選んでコピーできる提案の本文だけは、フォーカスと選択を受け取る
	root.addEventListener("mousedown", (e) => {
		const target = e.target as Element;
		if (target instanceof HTMLInputElement) return;
		if (target.closest?.(".panel-body")) return;
		e.preventDefault();
	});
	// 検索欄や提案の本文で打ったキーが Slack に届くと、入力欄に移ったりショートカットが動いたり、
	// Slack のコピーの処理が選んだ文字を上書きしたりするので、Shadow DOM の外へは伝えない
	for (const type of [
		"keydown",
		"keyup",
		"keypress",
		"input",
		"beforeinput",
		"copy",
		"cut",
	]) {
		root.addEventListener(type, (e) => e.stopPropagation());
	}

	// AI の提案のパネル
	const panel = document.createElement("div");
	panel.className = "panel";
	panel.hidden = true;
	const panelBody = document.createElement("p");
	panelBody.className = "panel-body";
	// 押したときにフォーカスを受け取り、Cmd+C などのキーが入力欄ではなくここに届くようにする
	panelBody.tabIndex = -1;
	const copyButton = document.createElement("button");
	copyButton.type = "button";
	copyButton.textContent = "コピー";
	const retryButton = document.createElement("button");
	retryButton.type = "button";
	retryButton.className = "retry";
	retryButton.textContent = "もう一度聞く";
	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.textContent = "閉じる";
	const panelNote = document.createElement("p");
	panelNote.className = "panel-note";
	const actions = document.createElement("div");
	actions.className = "panel-actions";
	actions.append(retryButton, copyButton, closeButton);
	panel.append(panelNote, panelBody, actions);

	// 定型文の一覧
	const picker = document.createElement("div");
	picker.className = "picker";
	picker.hidden = true;
	const search = document.createElement("input");
	search.type = "search";
	search.placeholder = "定型文を検索";
	const list = document.createElement("ul");
	list.setAttribute("role", "listbox");
	picker.append(search, list);
	root.append(panel, picker);

	let panelComposer: HTMLElement | null = null;
	let copyText = "";
	let pickerComposer: HTMLElement | null = null;
	let pickerRange: Range | null = null;
	let matches: Template[] = [];
	let active = 0;

	const hidePanel = () => {
		panel.hidden = true;
		panelComposer = null;
	};
	closeButton.addEventListener("click", hidePanel);
	retryButton.addEventListener("click", () => {
		if (panelComposer) handlers.onRetry(panelComposer);
	});
	copyButton.addEventListener("click", () => {
		void navigator.clipboard.writeText(copyText);
		copyButton.textContent = "コピーしました";
	});

	const showPanel = (
		composer: HTMLElement,
		state: PanelState,
		text: string,
		options: {
			// コピーボタンで写す文。省略すると表示している文をそのまま写す
			copy?: string;
			// 本文の上に添える注意書き (前の提案を出し直したときなど)
			note?: string;
		} = {},
	) => {
		hidePicker();
		panelComposer = composer;
		panel.dataset.state = state;
		panelBody.textContent = text;
		panelNote.textContent = options.note ?? "";
		panelNote.hidden = !options.note;
		copyText = options.copy ?? text;
		copyButton.hidden = state !== "done";
		retryButton.hidden = state === "loading";
		copyButton.textContent = "コピー";
		panel.hidden = false;
	};

	const isPanelFor = (composer: HTMLElement) => panelComposer === composer;

	const renderList = () => {
		matches = filterTemplates(templates, search.value);
		active = Math.min(active, Math.max(matches.length - 1, 0));
		list.replaceChildren(
			...matches.map((t, i) => {
				const li = document.createElement("li");
				li.setAttribute("role", "option");
				li.setAttribute("aria-selected", String(i === active));
				li.dataset.index = String(i);
				const preview = document.createElement("span");
				preview.className = "preview";
				preview.textContent = t.body.replace(/\s+/g, " ");
				li.append(t.name, preview);
				return li;
			}),
		);
		if (matches.length === 0) {
			const empty = document.createElement("li");
			empty.className = "empty";
			if (templates.length === 0) {
				const open = document.createElement("button");
				open.type = "button";
				open.textContent = "オプション画面で追加する";
				open.addEventListener("click", () => {
					hidePicker();
					handlers.onOpenOptions();
				});
				empty.append("定型文がまだありません。", open);
			} else {
				empty.textContent = "見つかりません";
			}
			list.append(empty);
		}
	};

	function hidePicker() {
		picker.hidden = true;
		pickerComposer = null;
		pickerRange = null;
	}

	const choose = (index: number) => {
		const template = matches[index];
		const composer = pickerComposer;
		const range = pickerRange;
		hidePicker();
		if (template && composer)
			handlers.onPickTemplate(composer, template, range);
	};

	const showPicker = (composer: HTMLElement) => {
		hidePanel();
		pickerComposer = composer;
		pickerRange = handlers.rangeOf(composer);
		search.value = "";
		active = 0;
		renderList();
		picker.hidden = false;
		search.focus();
	};

	search.addEventListener("input", () => {
		active = 0;
		renderList();
	});
	search.addEventListener("keydown", (e) => {
		if (e.isComposing) return;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			const step = e.key === "ArrowDown" ? 1 : -1;
			active = (active + step + matches.length) % Math.max(matches.length, 1);
			renderList();
		} else if (e.key === "Enter") {
			e.preventDefault();
			choose(active);
		} else if (e.key === "Escape") {
			e.preventDefault();
			const composer = pickerComposer;
			hidePicker();
			composer?.focus();
		}
	});
	list.addEventListener("click", (e) => {
		const li = (e.target as Element).closest?.("li[data-index]");
		if (li instanceof HTMLElement) choose(Number(li.dataset.index));
	});

	// 一覧の外を押したら閉じる
	const onOutside = (e: MouseEvent) => {
		if (!picker.hidden && !e.composedPath().includes(host)) hidePicker();
	};
	document.addEventListener("mousedown", onOutside, true);

	const createBar = (composer: HTMLElement): Bar => {
		const el = document.createElement("div");
		el.className = "bar";
		const badge = document.createElement("span");
		badge.className = "badge";
		const ai = iconButton("ai", "AI に聞く", AI_ICON);
		const template = iconButton("template", "定型文", TEMPLATE_ICON);
		// 開いているパネルをもう一度押したら閉じる
		ai.addEventListener("click", () =>
			panelComposer === composer ? hidePanel() : handlers.onAsk(composer),
		);
		template.addEventListener("click", () =>
			pickerComposer === composer ? hidePicker() : showPicker(composer),
		);
		el.append(badge, ai, template);
		root.append(el);
		return { el, badge, ai, template };
	};

	// Slack のアイコンの色に合わせる (ダークテーマでも馴染むように)
	const matchColors = (source: Element | null) => {
		if (!source) return;
		const color = getComputedStyle(source).color;
		if (color && host.style.getPropertyValue("--icon") !== color) {
			host.style.setProperty("--icon", color);
		}
	};

	// 毎フレーム呼ぶので、値が変わったときだけ書き込む
	const setPosition = (
		el: HTMLElement,
		prop: "top" | "right" | "bottom",
		px: number,
	) => {
		const value = `${Math.round(px)}px`;
		if (el.style[prop] !== value) el.style[prop] = value;
	};

	// 送信ボタンの左に置く。Slack のボタンと重なるなら、入力欄の右上に逃がす
	const place = (bar: Bar, composer: HTMLElement) => {
		const viewportWidth = document.documentElement.clientWidth;
		const footer = composerFooter(composer);
		const width = bar.el.getBoundingClientRect().width;
		if (footer) {
			const suffix = footer.suffix.getBoundingClientRect();
			const left = suffix.left - FOOTER_GAP_PX - width;
			if (suffix.width > 0 && left >= footer.buttonsRight + FOOTER_GAP_PX) {
				setPosition(bar.el, "top", suffix.top + suffix.height / 2);
				setPosition(
					bar.el,
					"right",
					viewportWidth - suffix.left + FOOTER_GAP_PX,
				);
				bar.el.dataset.placement = "footer";
				return;
			}
		}
		const rect = composer.getBoundingClientRect();
		setPosition(bar.el, "top", rect.top + 14);
		setPosition(
			bar.el,
			"right",
			viewportWidth - rect.right + FALLBACK_INSET_PX,
		);
		bar.el.dataset.placement = "composer";
	};

	// パネルと一覧は入力欄の上に開く (入力欄は画面の下にあるため)
	const placePopover = (popover: HTMLElement, composer: HTMLElement) => {
		const viewportWidth = document.documentElement.clientWidth;
		const viewportHeight = document.documentElement.clientHeight;
		const rect = composer.getBoundingClientRect();
		setPosition(popover, "bottom", viewportHeight - rect.top + PANEL_GAP_PX);
		setPosition(
			popover,
			"right",
			viewportWidth - rect.right + FALLBACK_INSET_PX,
		);
	};

	// 位置は毎フレーム、描画の直前に合わせる。中身を更新する 0.5 秒ごとだけだと、
	// Slack の画面が動いたとき (下にバナーが出る、スレッドを開くなど) に取り残される (2026-11-03 に確認)
	const placeAll = () => {
		for (const [composer, bar] of bars) {
			if (!composer.isConnected) continue;
			place(bar, composer);
			if (composer === panelComposer) placePopover(panel, composer);
			if (composer === pickerComposer) placePopover(picker, composer);
		}
	};
	let frame = requestAnimationFrame(function loop() {
		placeAll();
		frame = requestAnimationFrame(loop);
	});

	const render = (items: readonly OverlayItem[]) => {
		const visible = new Set<HTMLElement>();
		for (const { composer, elapsed, canAsk } of items) {
			let bar = bars.get(composer);
			if (!bar) {
				bar = createBar(composer);
				bars.set(composer, bar);
			}
			bar.badge.hidden = !elapsed;
			bar.badge.textContent = elapsed?.text ?? "";
			bar.badge.dataset.level = elapsed?.level ?? "normal";
			bar.el.dataset.level = elapsed?.level ?? "normal";
			bar.ai.hidden = !canAsk;
			matchColors(composerFooter(composer)?.iconButton ?? null);
			visible.add(composer);
		}
		for (const [composer, bar] of bars) {
			if (visible.has(composer)) continue;
			bar.el.remove();
			bars.delete(composer);
		}
		// 新しく作った列も、表示される前に置き場所へ動かす
		placeAll();
		// 下書きが終わったら提案を閉じる。入力欄が消えたら一覧も閉じる
		const asked = items.find((i) => i.composer === panelComposer);
		if (panelComposer && !asked?.elapsed) hidePanel();
		if (pickerComposer && !visible.has(pickerComposer)) hidePicker();
	};

	const setTemplates = (next: Template[]) => {
		templates = next;
		if (!picker.hidden) renderList();
	};

	const destroy = () => {
		cancelAnimationFrame(frame);
		document.removeEventListener("mousedown", onOutside, true);
		host.remove();
		bars.clear();
	};

	return {
		render,
		showPanel,
		hidePanel,
		isPanelFor,
		setTemplates,
		destroy,
	};
}
