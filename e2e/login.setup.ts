import { SELECTORS } from "@/lib/slack-dom";
import { expect, SLACK_URL, test } from "./fixtures";

// 開いたブラウザで手動ログインする。ログイン状態は e2e-profile/ に残り、以降の e2e で使い回す
test("Slack に手動でログインする", async ({ page }) => {
	const timeout = 10 * 60_000;
	test.setTimeout(timeout);
	await page.goto(SLACK_URL);
	await expect(page.locator(SELECTORS.composer).first()).toBeVisible({
		timeout,
	});
});
