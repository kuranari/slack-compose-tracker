import type { ComposeRecord } from "@/lib/compose-record";
import { composerRange, insertIntoComposer } from "@/lib/composer-insert";
import {
	createComposerOverlay,
	type OverlayItem,
} from "@/lib/composer-overlay";
import {
	closeSession,
	type DraftContext,
	type DraftSession,
	draftKey,
	observeText,
	recordInput,
	SEND_WINDOW_MS,
	shouldSave,
	useTemplate,
} from "@/lib/draft-session";
import { elapsedLevel, formatDuration } from "@/lib/duration";
import {
	openOptionsMessage,
	saveRecordMessage,
	suggestMessage,
} from "@/lib/messages";
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
import {
	type SuggestOk,
	type SuggestResult,
	suggestionView,
} from "@/lib/suggest-prompt";
import {
	getSuggestSettings,
	isSuggestReady,
	watchSuggestSettings,
} from "@/lib/suggest-settings";
import { getTemplates, watchTemplates } from "@/lib/template-store";
import type { Template } from "@/lib/templates";

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
		// AI のボタンを押すと、AI に本文を見てもらう (docs/ai-suggest-design.md)。
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
		// 提案は下書きごとに覚えておき、AI のボタンでは出し直すだけにする。API を呼ぶのは、
		// 初めて聞くときと「もう一度聞く」を押したときだけ。下書きが終わったら忘れる
		type Suggestion =
			| { state: "loading"; draft: string }
			| { state: "done"; draft: string; result: SuggestOk };
		const suggestions = new Map<string, Suggestion>();

		const showSuggestion = (composer: HTMLElement, s: Suggestion) => {
			if (s.state === "loading") {
				badges.showPanel(composer, "loading", "考えています…");
				return;
			}
			const changed = s.draft !== composerText(composer);
			badges.showPanel(composer, "done", suggestionView(s.result), {
				copy: s.result.draft,
				...(changed && {
					note: "この提案のあとに下書きが変わっています。今の下書きで聞くなら「もう一度聞く」を押してください",
				}),
			});
		};

		const requestSuggestion = (composer: HTMLElement, key: string) => {
			const draft = composerText(composer);
			if (!draft) return;
			const previous = suggestions.get(key);
			const pending: Suggestion = { state: "loading", draft };
			suggestions.set(key, pending);
			showSuggestion(composer, pending);
			// 失敗したら前の提案に戻す (エラーは覚えない。次に押せばまた聞く)
			const restore = () => {
				if (suggestions.get(key) !== pending) return;
				if (previous?.state === "done") suggestions.set(key, previous);
				else suggestions.delete(key);
			};
			browser.runtime
				.sendMessage(suggestMessage(draft))
				.then((result: SuggestResult) => {
					if (result.ok) {
						if (suggestions.get(key) === pending) {
							suggestions.set(key, { state: "done", draft, result });
						}
					} else restore();
					if (!badges.isPanelFor(composer)) return;
					if (result.ok) {
						showSuggestion(composer, { state: "done", draft, result });
					} else badges.showPanel(composer, "error", result.error);
				})
				.catch((err: unknown) => {
					restore();
					if (badges.isPanelFor(composer)) {
						badges.showPanel(composer, "error", String(err));
					}
				});
		};

		const askSuggestion = (composer: HTMLElement) => {
			const key = keyOf(composer);
			if (!key) return;
			const cached = suggestions.get(key);
			if (cached) showSuggestion(composer, cached);
			else requestSuggestion(composer, key);
		};

		const retrySuggestion = (composer: HTMLElement) => {
			const key = keyOf(composer);
			if (key && suggestions.get(key)?.state !== "loading") {
				requestSuggestion(composer, key);
			}
		};

		// 定型文は Slack の貼り付けの処理で入れる (lib/composer-insert.ts)。貼り付けは
		// input イベントを出さないので、下の paste の処理で下書きを始め、そこで使った定型文も残す
		const pendingTemplates = new WeakMap<HTMLElement, string>();
		const insertTemplate = (
			composer: HTMLElement,
			template: Template,
			range: Range | null,
		) => {
			// 変換中に貼ると未確定の文字と混ざるので入れない
			if (composing.has(composer)) return;
			pendingTemplates.set(composer, template.id);
			insertIntoComposer(composer, template.body, range);
		};

		const badges = createComposerOverlay({
			onAsk: askSuggestion,
			onRetry: retrySuggestion,
			onPickTemplate: insertTemplate,
			onOpenOptions: () => {
				void browser.runtime.sendMessage(openOptionsMessage());
			},
			rangeOf: composerRange,
		});
		ctx.onInvalidated(badges.destroy);
		void getTemplates().then(badges.setTemplates);
		ctx.onInvalidated(watchTemplates(badges.setTemplates));

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
			let session = recordInput(
				prev,
				Date.now(),
				text,
				composing.has(composer),
			);
			const templateId = pendingTemplates.get(composer);
			if (templateId) {
				session = useTemplate(session, templateId);
				pendingTemplates.delete(composer);
			}
			sessions.set(key, session);
			if (!prev) log("start", c);
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
			const items: OverlayItem[] = [];
			for (const composer of findComposers()) {
				const c = contextOf(composer);
				if (!c) continue;
				const key = draftKey(c);
				const session = sessions.get(key);
				const text = composerText(composer);
				if (!session) {
					// 計測していない下書き (リロード後に Slack が戻したものなど) に聞いた提案も、
					// 消されたら忘れる
					if (!text) suggestions.delete(key);
					// 空の入力欄でもボタンは出す (定型文で書き始められるように)
					items.push({
						composer,
						draft: { type: text ? "untracked" : "empty" },
					});
					continue;
				}
				if (text) {
					sessions.set(
						key,
						observeText(session, now, text, composing.has(composer)),
					);
					const elapsed = now - session.startedAt;
					items.push({
						composer,
						draft: {
							type: "timing",
							text: formatDuration(elapsed),
							level: elapsedLevel(elapsed),
						},
					});
					continue;
				}
				items.push({ composer, draft: { type: "empty" } });
				sessions.delete(key);
				suggestions.delete(key);
				const record = closeSession(session, c, now, pendingSends.get(key));
				if (shouldSave(record)) save(record);
				pendingSends.delete(key);
			}
			badges.render(items, { aiReady: suggestReady });
		}, TICK_MS);

		ctx.setInterval(() => {
			if (findComposers().length === 0) warn("health: composer not found");
		}, HEALTH_CHECK_MS);
	},
});
