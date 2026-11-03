import type { Page } from "@playwright/test";
import { MIN_DISCARD_MS, SEND_WINDOW_MS } from "@/lib/draft-session";
import { clearRecords, expect, readRecords, SLACK_URL, test } from "./fixtures";
import {
	badges,
	channelComposer,
	clearComposer,
	closeThreadPane,
	imeCompose,
	openThreadOf,
	overlayButton,
	recordEnterKeydowns,
	threadComposer,
	threadParentTs,
	threadSendButton,
} from "./slack";

// 自分宛て DM に実際にメッセージを送る。送信キーは「Cmd+Enter で送信」設定を前提とする
const SEND_KEY = "ControlOrMeta+Enter";
const BADGE_TEXT = /^\d+:\d{2}$/;

const uniqueText = (label: string) => `e2e ${label} ${Date.now()}`;

// バッジ ("m:ss") の経過時間が ms 以上になるまで待つ。MIN_DISCARD_MS 未満の破棄は
// 記録されないので、破棄を確かめるテストは下書きをこれ以上続けてから消す
const waitElapsed = async (page: Page, ms: number) => {
	const elapsedMs = async () => {
		const [m = 0, s = 0] = (await badges(page).first().textContent())
			?.split(":")
			.map(Number) ?? [0, 0];
		return (m * 60 + s) * 1000;
	};
	await expect
		.poll(elapsedMs, { timeout: ms + 10_000 })
		.toBeGreaterThanOrEqual(ms);
};

test.beforeEach(async ({ page, serviceWorker }) => {
	await page.goto(SLACK_URL);
	await expect(channelComposer(page)).toBeVisible({ timeout: 30_000 });
	await closeThreadPane(page);
	// 以前の下書きが残っていると開始時刻が不定になるので消してから始める
	await clearComposer(channelComposer(page));
	await clearRecords(serviceWorker);
});

test("チャンネルで入力するとバッジが出て、送信すると記録される", async ({
	page,
	serviceWorker,
}) => {
	const text = uniqueText("channel");
	const composer = channelComposer(page);
	await composer.pressSequentially(text);

	await expect(badges(page)).toHaveCount(1);
	await expect(badges(page).first()).toHaveText(BADGE_TEXT);

	await composer.press(SEND_KEY);

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
	const [record] = await readRecords(serviceWorker);
	expect(record).toMatchObject({
		outcome: "sent",
		pane: "channel",
		length: text.length,
		text,
	});
	// 名前は Slack の表示から読むので、ワークスペースに依存しない形で「取れていること」だけ確かめる
	expect(record?.teamName).toMatch(/\S/);
	expect(record?.channelName).toMatch(/\S/);
	expect(record).not.toHaveProperty("threadTs");
	await expect(badges(page)).toHaveCount(0);
});

test("全文を消すと破棄として記録される", async ({ page, serviceWorker }) => {
	const composer = channelComposer(page);
	await composer.pressSequentially(uniqueText("discard"));
	await expect(badges(page)).toHaveCount(1);
	await waitElapsed(page, MIN_DISCARD_MS);

	await clearComposer(composer);

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
	const [record] = await readRecords(serviceWorker);
	expect(record?.outcome).toBe("discarded");
	expect(record?.durationMs).toBeGreaterThanOrEqual(MIN_DISCARD_MS);
});

test("打ち始めてすぐ消した破棄は記録しない", async ({
	page,
	serviceWorker,
}) => {
	const composer = channelComposer(page);
	await composer.pressSequentially("あ");
	await expect(badges(page)).toHaveCount(1);

	await clearComposer(composer);
	await expect(badges(page)).toHaveCount(0);

	// 下書きを締める定期チェック (500ms ごと) が何度か走るのを待ってから確かめる
	await page.waitForTimeout(1_500);
	expect(await readRecords(serviceWorker)).toHaveLength(0);
});

test("補完を Enter で確定してすぐ消しても、送信ではなく破棄になる", async ({
	page,
	serviceWorker,
}) => {
	const composer = channelComposer(page);
	// ":pra" で絵文字の補完が開き、Enter で :pray: に確定する
	await composer.pressSequentially(`${uniqueText("autocomplete")} :pra`);
	// 破棄として記録される長さにしておく。待つのは Enter の前にして、
	// Enter から消すまでは送信の猶予 (SEND_WINDOW_MS) 内に収める
	await waitElapsed(page, MIN_DISCARD_MS);
	await composer.press("Enter");
	await expect(composer.locator("img")).toHaveCount(1);

	// 送信の猶予 (SEND_WINDOW_MS) 内に消す
	await clearComposer(composer);

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
	const [record] = await readRecords(serviceWorker);
	expect(record?.outcome).toBe("discarded");
});

test("スレッドで送信ボタンを押すと threadTs 付きで記録される", async ({
	page,
	serviceWorker,
}) => {
	const parentText = uniqueText("thread-parent");
	await channelComposer(page).pressSequentially(parentText);
	await channelComposer(page).press(SEND_KEY);
	await openThreadOf(page, parentText);

	const reply = uniqueText("thread-reply");
	await threadComposer(page).pressSequentially(reply);
	await expect(badges(page)).toHaveCount(1);
	await threadSendButton(page).click();

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(2);
	const threadRecord = (await readRecords(serviceWorker)).find(
		(r) => r.pane === "thread",
	);
	expect(threadRecord).toMatchObject({
		outcome: "sent",
		length: reply.length,
		text: reply,
		threadTs: await threadParentTs(page),
	});
});

test("貼り付けで始めた下書きも記録される", async ({ page, serviceWorker }) => {
	// Slack は貼り付けを自前で処理して DOM を書き換え、input イベントを出さない
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	const text = uniqueText("paste");
	await page.evaluate((t) => navigator.clipboard.writeText(t), text);
	const composer = channelComposer(page);
	await composer.click();
	await page.keyboard.press("ControlOrMeta+v");
	await expect(composer).toHaveText(text);
	await expect(badges(page)).toHaveCount(1);
	await waitElapsed(page, MIN_DISCARD_MS);
	await clearComposer(composer);

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
	const [record] = await readRecords(serviceWorker);
	expect(record).toMatchObject({ outcome: "discarded", text });
});

test("太字やリストは Markdown の記法で本文に残る", async ({
	page,
	serviceWorker,
}) => {
	const composer = channelComposer(page);
	await composer.click();
	await page.keyboard.type("普通 ");
	await page.keyboard.press("ControlOrMeta+b");
	await page.keyboard.type("太字");
	await page.keyboard.press("ControlOrMeta+b");
	await page.keyboard.press("Enter");
	await page.keyboard.type("- 箇条1");
	await page.keyboard.press("Enter");
	await page.keyboard.type("箇条2");
	await waitElapsed(page, MIN_DISCARD_MS);
	await clearComposer(composer);

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
	const [record] = await readRecords(serviceWorker);
	expect(record).toMatchObject({
		outcome: "discarded",
		text: "普通 **太字**\n- 箇条1\n- 箇条2",
		textFormat: "markdown",
	});
});

test("絵文字は :name: の表記で本文に残る", async ({ page, serviceWorker }) => {
	const text = uniqueText("emoji");
	const composer = channelComposer(page);
	// 閉じのコロンを打つと Slack が絵文字 (<img>) に置き換える
	await composer.pressSequentially(`${text} :pray: `);
	await expect(composer.locator("img")).toHaveCount(1);
	await composer.press(SEND_KEY);

	await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
	const [record] = await readRecords(serviceWorker);
	expect(record?.text).toBe(`${text} :pray:`);
});

test.describe("日本語入力 (IME)", () => {
	test("変換確定の Enter は送信操作とみなさない", async ({
		page,
		serviceWorker,
	}) => {
		const composer = channelComposer(page);
		await composer.click();
		const enterKeydowns = await recordEnterKeydowns(page);
		const ime = await imeCompose(page);

		await ime.setComposition("にほんご");
		await expect(badges(page)).toHaveCount(1);
		// 破棄として記録される長さにしておく。待つのは確定の Enter の前にして、
		// Enter から消すまでは送信の猶予 (SEND_WINDOW_MS) 内に収める
		await waitElapsed(page, MIN_DISCARD_MS);
		await ime.pressConfirmEnter();
		await ime.commit("日本語");
		await ime.detach();

		// 再現の前提: 確定の Enter は実機と同じく isComposing=true で届いている
		expect(await enterKeydowns()).toEqual([true]);
		await expect(composer).toHaveText("日本語");

		// 送信の猶予内に消しても、送信ではなく破棄になるはず
		await clearComposer(composer);
		await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
		const [record] = await readRecords(serviceWorker);
		expect(record?.outcome).toBe("discarded");
		expect(Date.now() - (record?.endedAt ?? 0)).toBeLessThan(
			SEND_WINDOW_MS * 3,
		);
		// 変換中にバッジが出た (= 定期チェックが走った) 後でも、未確定の文字は履歴に残らない
		const texts = record?.snapshots.map((s) => s.text) ?? [];
		expect(texts.some((t) => t.includes("にほんご"))).toBe(false);
		expect(texts.at(-1)).toBe("日本語");
		// 比較用の rawSnapshots には、変換中の文字が残る
		const rawTexts = record?.rawSnapshots?.map((s) => s.text) ?? [];
		expect(rawTexts[0]).toBe("にほんご");
		expect(rawTexts.at(-1)).toBe("日本語");
	});

	test("確定後の送信は記録され、文字数は確定後のテキストで数える", async ({
		page,
		serviceWorker,
	}) => {
		const composer = channelComposer(page);
		await composer.click();
		const ime = await imeCompose(page);

		await ime.setComposition("てすと");
		await ime.commit("テスト");
		await ime.detach();
		await composer.press(SEND_KEY);

		await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
		const [record] = await readRecords(serviceWorker);
		expect(record).toMatchObject({
			outcome: "sent",
			length: 3,
			text: "テスト",
		});
		// 変換中に始まった下書きでも、履歴は確定後の文字だけになる
		expect(record?.snapshots.map((s) => s.text)).toEqual(["テスト"]);
	});
});

test.describe("AI の提案", () => {
	test.beforeEach(async ({ serviceWorker }) => {
		// 本物のキーは使わない。ダミーのキーなので API は認証エラーを返し、その表示までを確かめる
		await serviceWorker.evaluate(async () => {
			const { chrome } = globalThis as unknown as {
				chrome: { storage: { local: { set(items: object): Promise<void> } } };
			};
			await chrome.storage.local.set({
				"suggest-settings": { enabled: true, apiKey: "e2e-dummy-key" },
			});
		});
	});

	test("有効にすると AI のボタンが出て、押すとパネルに結果が出る", async ({
		page,
	}) => {
		const composer = channelComposer(page);
		const ai = overlayButton(page, "ai");
		// 未入力のときは出ているが押せない。押しても入力欄のフォーカスは外れない
		await expect(ai).toHaveAttribute("aria-disabled", "true");
		await expect(page.locator(".badge[data-idle]").first()).toHaveText("0:00");
		await composer.click();
		// Playwright は aria-disabled のボタンを押せないものとして待つので、押す操作を強制する
		await ai.click({ force: true });
		await expect(composer).toBeFocused();
		await expect(page.locator(".panel")).toBeHidden();
		await composer.pressSequentially(uniqueText("suggest"));

		await expect(ai).toHaveAttribute("aria-disabled", "false");
		await ai.click();
		const panel = page.locator(".panel");
		await expect(panel).toBeVisible();
		await expect(panel).toContainText("API キーが正しくありません", {
			timeout: 15_000,
		});
		// ボタンを押しても入力欄のフォーカスは外れない
		await expect(composer).toBeFocused();

		await clearComposer(composer);
		await expect(panel).toBeHidden();
	});
});

test("リロード後に Slack が戻した下書きは計測せず、経過時間を – にする", async ({
	page,
	serviceWorker,
}) => {
	await serviceWorker.evaluate(async () => {
		const { chrome } = globalThis as unknown as {
			chrome: { storage: { local: { set(items: object): Promise<void> } } };
		};
		await chrome.storage.local.set({
			"suggest-settings": { enabled: true, apiKey: "e2e-dummy-key" },
		});
	});
	const text = uniqueText("restored");
	await channelComposer(page).pressSequentially(text);
	// Slack が下書きを保存するのを待ってから読み込み直す
	await page.waitForTimeout(3_000);
	await page.reload();
	const composer = channelComposer(page);
	await expect(composer).toHaveText(text, { timeout: 30_000 });

	await expect(page.locator(".badge[data-idle]").first()).toHaveText("–");
	await expect(overlayButton(page, "ai")).toHaveAttribute(
		"aria-disabled",
		"false",
	);
	await clearComposer(composer);
	await expect(page.locator(".badge[data-idle]").first()).toHaveText("0:00");
	// 計測していないので、消しても破棄として記録しない
	await page.waitForTimeout(1_000);
	expect(await readRecords(serviceWorker)).toHaveLength(0);
});

test.describe("AI の提案 (API を差し替え)", () => {
	test.beforeEach(async ({ serviceWorker }) => {
		await serviceWorker.evaluate(async () => {
			const { chrome } = globalThis as unknown as {
				chrome: { storage: { local: { set(items: object): Promise<void> } } };
			};
			await chrome.storage.local.set({
				"suggest-settings": { enabled: true, apiKey: "e2e-dummy-key" },
			});
		});
	});

	test("一度聞いた提案は出し直すだけで、もう一度聞くときだけ API を呼ぶ", async ({
		page,
		extensionContext,
	}) => {
		let calls = 0;
		// background (Service Worker) から Claude API への通信を差し替える
		await extensionContext.route("https://api.anthropic.com/**", (route) => {
			calls++;
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: `msg_e2e_${calls}`,
					type: "message",
					role: "assistant",
					model: "claude-opus-5-5",
					content: [
						{
							type: "text",
							text: JSON.stringify({
								draft: `**文案${calls}**`,
								points: ["結論を先に"],
							}),
						},
					],
					stop_reason: "end_turn",
					stop_sequence: null,
					usage: { input_tokens: 1, output_tokens: 1 },
				}),
			});
		});
		const composer = channelComposer(page);
		await composer.pressSequentially(uniqueText("suggest-cache"));
		const ai = overlayButton(page, "ai");
		const panel = page.locator(".panel");

		await ai.click();
		await expect(panel).toContainText("**文案1**");
		expect(calls).toBe(1);

		// 閉じて開き直しても API は呼ばない
		await ai.click();
		await expect(panel).toBeHidden();
		await ai.click();
		await expect(panel).toContainText("**文案1**");
		expect(calls).toBe(1);

		// 下書きを変えたら、そのことを添えて前の提案を出す
		await ai.click();
		await composer.press("End");
		await composer.pressSequentially(" 追記");
		await ai.click();
		await expect(panel.locator(".panel-note")).toContainText(
			"下書きが変わっています",
		);
		expect(calls).toBe(1);

		// 本文の一部を選んでコピーできる
		await page
			.context()
			.grantPermissions(["clipboard-read", "clipboard-write"]);
		const body = panel.locator(".panel-body");
		// マウスでなぞって選ぶ。クリップボードに入るのは選んだ文字だけ
		const box = await body.boundingBox();
		if (!box) throw new Error("提案の本文が見えない");
		await page.mouse.move(box.x + 1, box.y + 4);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width - 1, box.y + box.height - 4, {
			steps: 5,
		});
		await page.mouse.up();
		await page.keyboard.press("ControlOrMeta+c");
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toContain("**文案1**");

		await panel.locator("button.retry").click();
		await expect(panel).toContainText("**文案2**");
		await expect(panel.locator(".panel-note")).toBeHidden();
		expect(calls).toBe(2);

		await extensionContext.unrouteAll();
		await clearComposer(composer);
		await expect(panel).toBeHidden();
	});
});

test.describe("定型文", () => {
	const template = {
		id: "e2e-template",
		name: "e2e お礼",
		body: "**ありがとうございます**\n- 一つ目",
	};

	test.beforeEach(async ({ serviceWorker }) => {
		await serviceWorker.evaluate(async (t) => {
			const { chrome } = globalThis as unknown as {
				chrome: { storage: { local: { set(items: object): Promise<void> } } };
			};
			await chrome.storage.local.set({ templates: [t] });
		}, template);
	});

	test("一覧から選ぶと書式付きで入り、使った定型文が記録に残る", async ({
		page,
		serviceWorker,
	}) => {
		const composer = channelComposer(page);
		await composer.click();
		await page.keyboard.type("前置き ");
		const button = overlayButton(page, "template");
		await expect(button).toBeVisible();
		await page.screenshot({ path: "test-results/overlay-footer.png" });
		await button.click();

		const search = page.locator(".picker input");
		await expect(search).toBeFocused();
		// 検索欄で打った文字は Slack の入力欄に入らない
		await page.keyboard.type("お礼");
		await expect(page.locator(".picker li[data-index]")).toHaveCount(1);
		await page.keyboard.press("Enter");

		await expect(page.locator(".picker")).toBeHidden();
		await expect(composer.locator("strong")).toHaveText("ありがとうございます");
		await expect(composer.locator("li")).toHaveText("一つ目");
		await waitElapsed(page, MIN_DISCARD_MS);
		await clearComposer(composer);

		await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
		const [record] = await readRecords(serviceWorker);
		// Slack は貼り付けたリストの前に空行を入れる
		expect(record?.text).toBe("前置き **ありがとうございます**\n\n- 一つ目");
		expect(record?.templateIds).toEqual([template.id]);
	});

	test("空の入力欄でも定型文で書き始められる", async ({
		page,
		serviceWorker,
	}) => {
		const composer = channelComposer(page);
		await expect(badges(page)).toHaveCount(0);
		await overlayButton(page, "template").click();
		await page.keyboard.press("Enter");
		await expect(composer.locator("strong")).toHaveText("ありがとうございます");
		await expect(badges(page)).toHaveCount(1);
		await waitElapsed(page, MIN_DISCARD_MS);
		await clearComposer(composer);

		await expect.poll(() => readRecords(serviceWorker)).toHaveLength(1);
		const [record] = await readRecords(serviceWorker);
		expect(record?.templateIds).toEqual([template.id]);
	});
});
