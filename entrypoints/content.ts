import type { ComposeRecord } from "@/lib/compose-record";
import {
	closeSession,
	type DraftContext,
	type DraftSession,
	draftKey,
	observeText,
	recordInput,
	SEND_WINDOW_MS,
	shouldSave,
} from "@/lib/draft-session";
import { elapsedLevel, formatDuration } from "@/lib/duration";
import { createBadgeLayer } from "@/lib/elapsed-badge";
import { saveRecordMessage, suggestMessage } from "@/lib/messages";
import {
	closestComposer,
	composerChannelId,
	composerForSendButton,
	composerText,
	findComposers,
	isInThreadPane,
	isSendButton,
	parseLocation,
	readChannelName,
	readTeamName,
	threadChannelIdFromPath,
	threadRootChannelId,
	threadRootTs,
} from "@/lib/slack-dom";
import { type SuggestResult, suggestionView } from "@/lib/suggest-prompt";
import {
	getSuggestSettings,
	isSuggestReady,
	watchSuggestSettings,
} from "@/lib/suggest-settings";

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
		// バッジを押すと、AI に本文を見てもらう (docs/ai-suggest-design.md)。
		// 本文を外部に送るので、オプション画面で有効にした端末でだけ押せるようにする
		let suggestReady = false;
		void getSuggestSettings().then((s) => {
			suggestReady = isSuggestReady(s);
		});
		ctx.onInvalidated(
			watchSuggestSettings((s) => {
				suggestReady = isSuggestReady(s);
			}),
		);
		const asking = new WeakSet<HTMLElement>();
		const askSuggestion = (composer: HTMLElement) => {
			const draft = composerText(composer);
			if (!draft || asking.has(composer)) return;
			asking.add(composer);
			badges.showPanel(composer, "loading", "考えています…");
			browser.runtime
				.sendMessage(suggestMessage(draft))
				.then((result: SuggestResult) => {
					if (!badges.isPanelFor(composer)) return;
					if (result.ok) {
						badges.showPanel(
							composer,
							"done",
							suggestionView(result),
							result.draft,
						);
					} else badges.showPanel(composer, "error", result.error);
				})
				.catch((err: unknown) => {
					if (badges.isPanelFor(composer)) {
						badges.showPanel(composer, "error", String(err));
					}
				})
				.finally(() => asking.delete(composer));
		};
		const badges = createBadgeLayer(askSuggestion);
		ctx.onInvalidated(badges.destroy);

		// URL がチャンネルを指していない画面 (Threads 一覧など) や、親メッセージが
		// 特定できないスレッドは、下書きを一意に識別できないので追跡しない
		const contextOf = (composer: HTMLElement): DraftContext | null => {
			const loc = parseLocation(location.pathname);
			if (!loc) return null;
			const { teamId } = loc;
			// アクティビティや検索の画面では、URL のチャンネルの位置に "activity-inbox" などが入る。
			// 下書きは送信先の会話ごとに 1 つなので、画面によらず会話の ID で扱う
			const channelId = composerChannelId(composer) ?? loc.channelId;
			if (!isInThreadPane(composer)) {
				return { teamId, channelId, pane: "channel" };
			}
			const threadTs = threadRootTs(composer);
			if (!threadTs) return null;
			return {
				teamId,
				channelId:
					composerChannelId(composer) ??
					threadRootChannelId(composer) ??
					threadChannelIdFromPath(location.pathname) ??
					loc.channelId,
				threadTs,
				pane: "thread",
			};
		};

		const keyOf = (composer: HTMLElement | null) => {
			const c = composer && contextOf(composer);
			return c ? draftKey(c) : null;
		};

		// IME で変換中の入力欄。履歴に未確定の文字を残さないために使う (lib/draft-session.ts)
		const composing = new WeakSet<HTMLElement>();
		ctx.addEventListener(
			document,
			"compositionstart",
			(e) => {
				const composer = closestComposer(e.target);
				if (composer) composing.add(composer);
			},
			{ capture: true },
		);
		ctx.addEventListener(
			document,
			"compositionend",
			(e) => {
				const composer = closestComposer(e.target);
				if (composer) composing.delete(composer);
			},
			{ capture: true },
		);

		// 送信操作の後、送信の猶予の間だけ入力欄の変化を見張る。送信なら入力欄は空になるが、
		// 補完 (絵文字・チャンネル・メンション) の確定では文字が残ったまま書き換わる。
		// Slack は補完の確定で input イベントを出さず DOM を直接書き換えることがあるので
		// (2026-11-02 に確認)、input ではなく DOM の変化で判定する
		const watchAfterSend = (composer: HTMLElement, key: string) => {
			const observer = new MutationObserver(() => {
				if (composerText(composer)) pendingSends.delete(key);
				observer.disconnect();
			});
			observer.observe(composer, {
				childList: true,
				subtree: true,
				characterData: true,
			});
			ctx.setTimeout(() => observer.disconnect(), SEND_WINDOW_MS);
			ctx.onInvalidated(() => observer.disconnect());
		};

		const markSend = (composer: HTMLElement | null) => {
			const key = keyOf(composer);
			if (!composer || !key) return;
			pendingSends.set(key, Date.now());
			watchAfterSend(composer, key);
		};

		// 締めるのは入力欄が見えているとき、つまりそのチャンネルを開いているときなので、
		// ヘッダーから読むチャンネル名もこの記録のものになる
		const withNames = (record: ComposeRecord): ComposeRecord => {
			const teamName = readTeamName();
			const channelName = readChannelName(record.channelId);
			return {
				...record,
				...(teamName && { teamName }),
				...(channelName && { channelName }),
			};
		};

		const save = (closed: ComposeRecord) => {
			const record = withNames(closed);
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
				if (composer) onComposerInput(composer);
			},
			{ capture: true },
		);

		// Slack は貼り付けを自前で処理して DOM を書き換え、input イベントを出さない (2026-11-03 に確認)。
		// 書き換えは非同期のことがある (空の入力欄に Markdown を貼ったときなど) ので、
		// 貼り付けの後しばらく入力欄を見張り、文字が入ったところで入力として扱う
		const PASTE_WATCH_MS = 1_000;
		ctx.addEventListener(
			document,
			"paste",
			(e) => {
				const composer = closestComposer(e.target);
				if (!composer) return;
				// 途中の書き換えで一度空になることもあるので、文字が入るまで待つ
				const observer = new MutationObserver(() => {
					if (!composerText(composer)) return;
					observer.disconnect();
					onComposerInput(composer);
				});
				observer.observe(composer, {
					childList: true,
					subtree: true,
					characterData: true,
				});
				ctx.setTimeout(() => observer.disconnect(), PASTE_WATCH_MS);
				ctx.onInvalidated(() => observer.disconnect());
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

		const onComposerInput = (composer: HTMLElement) => {
			const c = contextOf(composer);
			if (!c) return;
			const text = composerText(composer);
			if (!text) return;
			const key = draftKey(c);
			// 送信なら Slack は input を出さずに入力欄を空にする。送信操作の後に文字が残る入力が
			// 来たなら、その Enter は補完 (チャンネル・メンション・絵文字) の確定や改行だった
			pendingSends.delete(key);
			const prev = sessions.get(key);
			sessions.set(
				key,
				recordInput(prev, Date.now(), text, composing.has(composer)),
			);
			if (!prev) log("start", c);
		};

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
					sessions.set(
						key,
						observeText(session, now, text, composing.has(composer)),
					);
					const elapsed = now - session.startedAt;
					const level = elapsedLevel(elapsed);
					items.push({
						composer,
						text: formatDuration(elapsed),
						level,
						clickable: suggestReady,
					});
					continue;
				}
				sessions.delete(key);
				const record = closeSession(session, c, now, pendingSends.get(key));
				if (shouldSave(record)) save(record);
				pendingSends.delete(key);
			}
			badges.render(items);
		}, TICK_MS);

		ctx.setInterval(() => {
			if (findComposers().length === 0) warn("health: composer not found");
		}, HEALTH_CHECK_MS);
	},
});
