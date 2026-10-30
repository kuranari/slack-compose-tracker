// Slack の DOM に依存する検知ロジックはすべてこのファイルに集約する。
// セレクタが壊れたときに直す場所を 1 か所に限定するため。

export const SELECTORS = {
	composer: '[data-qa="message_input"] [contenteditable="true"]',
	sendButton: '[data-qa="texty_send_button"]',
	threadPane: '[data-qa="threads_flexpane"], .p-threads_flexpane',
	messageTs: "[data-msg-ts]",
	teamName: ".p-ia4_home_header_menu__team_name",
	channelHeaderName: '[data-qa="channel_name"]',
	sidebarChannelName: ".p-channel_sidebar__name",
} as const;

const sidebarChannel = (channelId: string) =>
	`[data-qa-channel-sidebar-channel-id="${CSS.escape(channelId)}"]`;

const nonEmpty = (s: string | null | undefined): string | undefined =>
	s?.trim() || undefined;

// 例: "kuranari（DM） - kuranari - Slack" → "kuranari"
// 先頭のチャンネル名側に " - " が含まれても崩れないよう、末尾から数える
export function teamNameFromTitle(title: string): string | undefined {
	const parts = title.split(" - ");
	return parts.length >= 3 && parts.at(-1) === "Slack"
		? nonEmpty(parts.at(-2))
		: undefined;
}

export function readTeamName(doc: Document = document): string | undefined {
	return (
		nonEmpty(doc.querySelector(SELECTORS.teamName)?.textContent) ??
		teamNameFromTitle(doc.title)
	);
}

// サイドバーは ID で引けるので取り違えが無い。サイドバーに無いチャンネル (未参加や
// 折りたたみ) はヘッダーで補うが、ヘッダーは「いま開いている」チャンネルの名前なので、
// 呼び出し側は channelId が現在の URL のものであることを保証すること
export function readChannelName(
	channelId: string,
	doc: Document = document,
): string | undefined {
	const item = doc.querySelector(sidebarChannel(channelId));
	return (
		nonEmpty(item?.querySelector(SELECTORS.sidebarChannelName)?.textContent) ??
		nonEmpty(doc.querySelector(SELECTORS.channelHeaderName)?.textContent)
	);
}

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

const threadRootMessage = (composer: HTMLElement): Element | null =>
	composer.closest(SELECTORS.threadPane)?.querySelector(SELECTORS.messageTs) ??
	null;

// スレッドを開いても URL は変わらないため、スレッドペイン先頭のメッセージ (親) の ts を使う
export function threadRootTs(composer: HTMLElement): string | undefined {
	return threadRootMessage(composer)?.getAttribute("data-msg-ts") ?? undefined;
}

// アクティビティや検索の画面では、URL のチャンネルの位置に "activity-inbox" などが入る。
// Slack の下書きはスレッドごとに 1 つで、どの画面から開いても同じものが出るので、
// 親メッセージのチャンネル ID を使い、画面によらず同じ下書きとして扱う
export function threadRootChannelId(composer: HTMLElement): string | undefined {
	return nonEmpty(
		threadRootMessage(composer)?.getAttribute("data-msg-channel-id"),
	);
}

// 例: /client/T1/activity-inbox/thread/C1-1700000000.000100 → "C1"
export function threadChannelIdFromPath(pathname: string): string | undefined {
	return pathname.match(/\/thread\/([^-/]+)-\d+\.\d+/)?.[1];
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
