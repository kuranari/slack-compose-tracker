// 本物の Slack を操作するヘルパー。拡張側のセレクタ (lib/slack-dom.ts) を流用し、
// テスト専用に必要なものだけここで足す
import { expect, type Locator, type Page } from "@playwright/test";
import { SELECTORS } from "@/lib/slack-dom";

// チャンネル側の入力欄はメッセージペインの下部にある (スレッドペインの入力欄と区別するため)
const CHANNEL_INPUT = ".p-message_pane_input_inner";
const START_THREAD = '[data-qa="start_thread"]';
const CLOSE_FLEXPANE = '[data-qa="close_flexpane"]';
// 同じセレクタに画面外の隠し contenteditable (.ql-clipboard) も一致するので除く
const VISIBLE = { visible: true } as const;

export function channelComposer(page: Page): Locator {
	return page
		.locator(CHANNEL_INPUT)
		.locator(SELECTORS.composer)
		.filter(VISIBLE);
}

export function threadPane(page: Page): Locator {
	return page.locator(SELECTORS.threadPane).first();
}

export function threadComposer(page: Page): Locator {
	return threadPane(page).locator(SELECTORS.composer).filter(VISIBLE);
}

export function threadSendButton(page: Page): Locator {
	return threadPane(page).locator(SELECTORS.sendButton);
}

// Shadow DOM (open) 内のバッジ。Playwright の CSS ロケータは open な shadow root を貫通する
export function badges(page: Page): Locator {
	return page.locator(".badge");
}

export async function clearComposer(composer: Locator): Promise<void> {
	await composer.click();
	await composer.press("ControlOrMeta+a");
	await composer.press("Backspace");
}

export async function closeThreadPane(page: Page): Promise<void> {
	const close = threadPane(page).locator(CLOSE_FLEXPANE);
	if (await close.isVisible()) await close.click();
}

export async function openThreadOf(page: Page, text: string): Promise<void> {
	const message = page
		.locator(SELECTORS.messageTs)
		.filter({ hasText: text })
		.last();
	// 送信直後はメッセージの描画やホバー時のツールバーが遅れることがあるので、
	// ボタンが出るまでホバーし直す (一度だけのホバーだとまれに 1 分待って落ちていた)
	await expect(async () => {
		await message.hover();
		await expect(message.locator(START_THREAD)).toBeVisible({
			timeout: 2_000,
		});
	}).toPass({ timeout: 20_000 });
	await message.locator(START_THREAD).click();
	await expect(threadComposer(page)).toBeVisible();
}

// スレッドペイン先頭 (親メッセージ) の ts。拡張が記録する threadTs と一致するはず
export async function threadParentTs(page: Page): Promise<string | null> {
	return threadPane(page)
		.locator(SELECTORS.messageTs)
		.first()
		.getAttribute("data-msg-ts");
}

// CDP で IME の変換中状態を作る。OS の IME そのものではないが、
// ブラウザが発行する composition イベントと isComposing は本物になる
export async function imeCompose(page: Page) {
	const cdp = await page.context().newCDPSession(page);
	return {
		setComposition: (text: string) =>
			cdp.send("Input.imeSetComposition", {
				text,
				selectionStart: text.length,
				selectionEnd: text.length,
			}),
		// 変換確定の Enter。実機の Chrome では keyCode 229 の Enter が届く
		pressConfirmEnter: async () => {
			for (const type of ["rawKeyDown", "keyUp"] as const) {
				await cdp.send("Input.dispatchKeyEvent", {
					type,
					key: "Enter",
					code: "Enter",
					windowsVirtualKeyCode: 229,
				});
			}
		},
		commit: (text: string) => cdp.send("Input.insertText", { text }),
		detach: () => cdp.detach(),
	};
}

// ページ側で keydown を記録し、IME の再現が実機と同じく isComposing=true になっているか確かめる
export async function recordEnterKeydowns(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as { __enterKeydowns: boolean[] };
		w.__enterKeydowns = [];
		document.addEventListener(
			"keydown",
			(e) => {
				if (e.key === "Enter") w.__enterKeydowns.push(e.isComposing);
			},
			true,
		);
	});
	return () =>
		page.evaluate(
			() =>
				(window as unknown as { __enterKeydowns: boolean[] }).__enterKeydowns,
		);
}
