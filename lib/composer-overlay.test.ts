// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createComposerOverlay, type DraftState } from "@/lib/composer-overlay";

const setup = () => {
	const composer = document.createElement("div");
	document.body.append(composer);
	const onAsk = vi.fn();
	const overlay = createComposerOverlay({
		onAsk,
		onRetry: vi.fn(),
		onPickTemplate: vi.fn(),
		onOpenOptions: vi.fn(),
		rangeOf: () => null,
	});
	const root = document.body.lastElementChild?.shadowRoot;
	const render = (draft: DraftState, aiReady = true) =>
		overlay.render([{ composer, draft }], { aiReady });
	const badge = () => root?.querySelector<HTMLElement>(".badge");
	const ai = () => root?.querySelector<HTMLButtonElement>("button.ai");
	return { overlay, onAsk, render, badge, ai };
};

afterEach(() => {
	document.body.replaceChildren();
});

it("空の入力欄では、経過時間を薄い 0:00 にし、AI は押しても何もしない", () => {
	const { render, badge, ai, onAsk } = setup();
	render({ type: "empty" });
	expect(badge()?.textContent).toBe("0:00");
	expect(badge()?.hasAttribute("data-idle")).toBe(true);
	expect(ai()?.getAttribute("aria-disabled")).toBe("true");
	ai()?.click();
	expect(onAsk).not.toHaveBeenCalled();
});

it("計測していない下書きでは、経過時間を – にし、AI は押せる", () => {
	const { render, badge, ai, onAsk } = setup();
	render({ type: "untracked" });
	expect(badge()?.textContent).toBe("–");
	expect(badge()?.hasAttribute("data-idle")).toBe(true);
	ai()?.click();
	expect(onAsk).toHaveBeenCalledTimes(1);
});

it("計測中は経過時間と目安の色を出し、下書きが空に戻ったら薄い表示と通常の色に戻す", () => {
	const { render, badge } = setup();
	render({ type: "timing", text: "5:00", level: "warn" });
	expect(badge()?.textContent).toBe("5:00");
	expect(badge()?.hasAttribute("data-idle")).toBe(false);
	expect(badge()?.dataset.level).toBe("warn");
	render({ type: "empty" });
	expect(badge()?.hasAttribute("data-idle")).toBe(true);
	expect(badge()?.dataset.level).toBe("normal");
});

it("AI の提案を使えない端末では AI のボタンを出さない", () => {
	const { render, ai } = setup();
	render({ type: "timing", text: "0:01", level: "normal" }, false);
	expect(ai()?.hidden).toBe(true);
});
