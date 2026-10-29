import {
	closeSession,
	type DraftContext,
	type DraftSession,
	draftKey,
	observeText,
	recordInput,
} from "@/lib/draft-session";
import { formatDuration } from "@/lib/duration";
import { createBadgeLayer } from "@/lib/elapsed-badge";
import { saveRecordMessage } from "@/lib/messages";
import {
	closestComposer,
	composerForSendButton,
	composerText,
	findComposers,
	isInThreadPane,
	isSendButton,
	parseLocation,
	threadRootTs,
} from "@/lib/slack-dom";

// オブジェクトのままだと DevTools 外 (CDP 経由のログ取得) で "Object" に潰れるため文字列化する
const format = (args: unknown[]) =>
	args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)));
const log = (...args: unknown[]) =>
	console.log("[slack-compose-tracker]", ...format(args));
const warn = (...args: unknown[]) =>
	console.warn("[slack-compose-tracker]", ...format(args));

const TICK_MS = 500;
const HEALTH_CHECK_MS = 5_000;

export default defineContentScript({
	matches: ["https://app.slack.com/*"],
	main(ctx) {
		log("loaded", parseLocation(location.pathname));

		const sessions = new Map<string, DraftSession>();
		const pendingSends = new Map<string, number>();
		const badges = createBadgeLayer();
		ctx.onInvalidated(badges.destroy);

		// URL がチャンネルを指していない画面 (Threads 一覧など) や、親メッセージが
		// 特定できないスレッドは、下書きを一意に識別できないので追跡しない
		const contextOf = (composer: HTMLElement): DraftContext | null => {
			const loc = parseLocation(location.pathname);
			if (!loc) return null;
			const { teamId, channelId } = loc;
			if (!isInThreadPane(composer)) {
				return { teamId, channelId, pane: "channel" };
			}
			const threadTs = threadRootTs(composer);
			return threadTs ? { teamId, channelId, threadTs, pane: "thread" } : null;
		};

		const keyOf = (composer: HTMLElement | null) => {
			const c = composer && contextOf(composer);
			return c ? draftKey(c) : null;
		};

		const markSend = (composer: HTMLElement | null) => {
			const key = keyOf(composer);
			if (key) pendingSends.set(key, Date.now());
		};

		const save = (record: ReturnType<typeof closeSession>) => {
			// 本文はコンソールに出さない
			const { text: _text, snapshots: _snapshots, ...meta } = record;
			log(record.outcome, meta);
			browser.runtime
				.sendMessage(saveRecordMessage(record))
				.catch((err: unknown) => warn("save failed", String(err)));
		};

		ctx.addEventListener(
			document,
			"input",
			(e) => {
				const composer = closestComposer(e.target);
				const c = composer && contextOf(composer);
				if (!composer || !c) return;
				const text = composerText(composer);
				if (!text) return;
				const key = draftKey(c);
				const prev = sessions.get(key);
				sessions.set(key, recordInput(prev, Date.now(), text));
				if (!prev) log("start", c);
			},
			{ capture: true },
		);

		ctx.addEventListener(
			document,
			"keydown",
			(e) => {
				if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
				markSend(closestComposer(e.target));
			},
			{ capture: true },
		);

		ctx.addEventListener(
			document,
			"click",
			(e) => {
				if (isSendButton(e.target)) markSend(composerForSendButton(e.target));
			},
			{ capture: true },
		);

		ctx.addEventListener(window, "wxt:locationchange", ({ newUrl }) => {
			log("navigate", parseLocation(newUrl.pathname));
		});

		// 送信後に Slack が入力欄を空にしても input イベントは来ないため、
		// 定期的に入力欄を見て「空になった下書き」を締め、表示も更新する
		ctx.setInterval(() => {
			const now = Date.now();
			const items = [];
			for (const composer of findComposers()) {
				const c = contextOf(composer);
				const key = c && draftKey(c);
				const session = key && sessions.get(key);
				if (!c || !key || !session) continue;
				const text = composerText(composer);
				if (text) {
					sessions.set(key, observeText(session, now, text));
					items.push({
						composer,
						text: formatDuration(now - session.startedAt),
					});
					continue;
				}
				sessions.delete(key);
				save(closeSession(session, c, now, pendingSends.get(key)));
				pendingSends.delete(key);
			}
			badges.render(items);
		}, TICK_MS);

		ctx.setInterval(() => {
			if (findComposers().length === 0) warn("health: composer not found");
		}, HEALTH_CHECK_MS);
	},
});
