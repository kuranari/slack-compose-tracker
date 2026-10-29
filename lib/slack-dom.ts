// Slack の DOM に依存する検知ロジックはすべてこのファイルに集約する。
// セレクタが壊れたときに直す場所を 1 か所に限定するため。

export const SELECTORS = {
	composer: '[data-qa="message_input"] [contenteditable="true"]',
	sendButton: '[data-qa="texty_send_button"]',
	threadPane: '[data-qa="threads_flexpane"], .p-threads_flexpane',
	messageTs: "[data-msg-ts]",
} as const;

export type Location = {
	teamId: string;
	channelId: string;
	threadTs?: string;
};

// 例: /client/T01234567/C01234567
//     /client/T01234567/C01234567/thread/C01234567-1700000000.000000
export function parseLocation(pathname: string): Location | null {
	const m = pathname.match(
		/^\/client\/([^/]+)\/([^/]+)(?:\/thread\/[^-]+-(\d+\.\d+))?/,
	);
	if (!m) return null;
	const [, teamId = "", channelId = "", threadTs] = m;
	return { teamId, channelId, threadTs };
}

// 画面外 (x=-99728, 幅 0) に隠し contenteditable が同じセレクタで存在するため除外する
export function findComposers(root: ParentNode = document): HTMLElement[] {
	return Array.from(
		root.querySelectorAll<HTMLElement>(SELECTORS.composer),
	).filter((el) => el.getBoundingClientRect().width > 0);
}

export function closestComposer(
	target: EventTarget | null,
): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	return target.closest<HTMLElement>(SELECTORS.composer);
}

export function isInThreadPane(composer: HTMLElement): boolean {
	return composer.closest(SELECTORS.threadPane) !== null;
}

// スレッドを開いても URL は変わらないため、スレッドペイン先頭のメッセージ (親) の ts を使う
export function threadRootTs(composer: HTMLElement): string | undefined {
	const pane = composer.closest(SELECTORS.threadPane);
	return (
		pane?.querySelector(SELECTORS.messageTs)?.getAttribute("data-msg-ts") ??
		undefined
	);
}

export function isSendButton(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest(SELECTORS.sendButton) !== null
	);
}

// ボタン押下時はフォーカスがボタンに移っているため、activeElement ではなく
// ボタンから祖先をたどって最も近い入力欄を探す (共通の親に data-qa が無い)
export function composerForSendButton(
	target: EventTarget | null,
): HTMLElement | null {
	if (!(target instanceof Element)) return null;
	for (let el = target.parentElement; el; el = el.parentElement) {
		const [composer] = findComposers(el);
		if (composer) return composer;
	}
	return null;
}

// Quill 系エディタは空でも "\n" を持つので trim して判定する
export function composerText(composer: HTMLElement): string {
	// biome-ignore lint/performance/useDomNodeTextContent: 下書きの改行を保持するため innerText を使う
	return composer.innerText.replace(/\u200b/g, "").trim();
}
