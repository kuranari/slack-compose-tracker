import { SEND_WINDOW_MS } from "@/lib/draft-session";
import { clearRecords, expect, readRecords, SLACK_URL, test } from "./fixtures";
import {
	badges,
	channelComposer,
	clearComposer,
	closeThreadPane,
	imeCompose,
	openThreadOf,
	recordEnterKeydowns,
	threadComposer,
	threadParentTs,
	threadSendButton,
} from "./slack";

// 自分宛て DM に実際にメッセージを送る。送信キーは「Cmd+Enter で送信」設定を前提とする
const SEND_KEY = "ControlOrMeta+Enter";
const BADGE_TEXT = /^\d+:\d{2}$/;

const uniqueText = (label: string) => `e2e ${label} ${Date.now()}`;

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
