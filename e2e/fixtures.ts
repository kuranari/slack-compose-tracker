import path from "node:path";
import {
	type BrowserContext,
	test as base,
	chromium,
	type Page,
	type Worker,
} from "@playwright/test";
import type { ComposeRecord } from "@/lib/compose-record";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTENSION_PATH = path.join(ROOT, "output/chrome-mv3");
// Slack のログイン状態を保持する専用プロファイル。普段使いの Chrome とは分ける
const PROFILE_DIR = path.join(ROOT, "e2e-profile");

const slackUrl = process.env.SLACK_E2E_URL;
if (!slackUrl) {
	throw new Error(
		"SLACK_E2E_URL が未設定です。.env.example を参考に .env を作成してください",
	);
}
export const SLACK_URL = slackUrl;

type WorkerFixtures = {
	extensionContext: BrowserContext;
	serviceWorker: Worker;
};

// ブラウザ起動と Slack の読み込みが重いので、コンテキストはワーカー単位で使い回す
export const test = base.extend<{ page: Page }, WorkerFixtures>({
	extensionContext: [
		async ({ headless }, use) => {
			const context = await chromium.launchPersistentContext(PROFILE_DIR, {
				channel: "chromium",
				headless,
				viewport: { width: 1400, height: 900 },
				args: [
					`--disable-extensions-except=${EXTENSION_PATH}`,
					`--load-extension=${EXTENSION_PATH}`,
				],
			});
			await use(context);
			await context.close();
		},
		{ scope: "worker" },
	],
	serviceWorker: [
		async ({ extensionContext }, use) => {
			const worker =
				extensionContext.serviceWorkers()[0] ??
				(await extensionContext.waitForEvent("serviceworker"));
			await use(worker);
		},
		{ scope: "worker" },
	],
	page: async ({ extensionContext }, use) => {
		const page =
			extensionContext.pages()[0] ?? (await extensionContext.newPage());
		await use(page);
	},
});

export { expect } from "@playwright/test";

type ChromeStorage = {
	storage: {
		local: {
			get(key: null): Promise<Record<string, unknown>>;
			clear(): Promise<void>;
		};
	};
};

// lib/record-store.ts の日付ごとのキー ("records:YYYY-MM-DD") をすべて読む
export async function readRecords(worker: Worker): Promise<ComposeRecord[]> {
	return worker.evaluate(async () => {
		const { chrome } = globalThis as unknown as { chrome: ChromeStorage };
		const items = await chrome.storage.local.get(null);
		return Object.keys(items)
			.filter((key) => key.startsWith("records:"))
			.sort()
			.flatMap((key) => items[key] as ComposeRecord[]);
	});
}

export async function clearRecords(worker: Worker): Promise<void> {
	await worker.evaluate(async () => {
		const { chrome } = globalThis as unknown as { chrome: ChromeStorage };
		await chrome.storage.local.clear();
	});
}
