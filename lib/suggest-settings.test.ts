import { beforeEach, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
	getSuggestSettings,
	isSuggestReady,
	setSuggestSettings,
} from "@/lib/suggest-settings";

beforeEach(() => {
	fakeBrowser.reset();
});

it("既定はオフ", async () => {
	expect(await getSuggestSettings()).toEqual({ enabled: false, apiKey: "" });
});

it("保存した設定を読める", async () => {
	await setSuggestSettings({ enabled: true, apiKey: "test-key" });
	expect(await getSuggestSettings()).toEqual({
		enabled: true,
		apiKey: "test-key",
	});
});

it.each([
	[{ enabled: true, apiKey: "test-key" }, true],
	[{ enabled: false, apiKey: "test-key" }, false],
	[{ enabled: true, apiKey: " " }, false],
])("isSuggestReady(%o) → %s", (settings, expected) => {
	expect(isSuggestReady(settings)).toBe(expected);
});
