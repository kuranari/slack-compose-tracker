// ダッシュボードの描画 (IO 層)。計算は day-list / replay / route に寄せ、ここは DOM とストレージの接続だけ
// 本文は任意の文字列なので、DOM には必ず textContent で入れる (innerHTML は使わない)
import "./style.css";
import { type ComposeRecord, dayKey } from "@/lib/compose-record";
import { formatDuration } from "@/lib/duration";
import { getRecordsOfDay } from "@/lib/record-store";
import {
	excerpt,
	formatDateTime,
	OUTCOME_LABEL,
	PANE_LABEL,
	summarizeDay,
	toDayRows,
} from "./day-list";
import {
	buildSteps,
	insertedText,
	nextIndex,
	playStartIndex,
	type ReplayStep,
} from "./replay";
import { formatRoute, parseRoute, type Route, shiftDay } from "./route";

// 1 ステップあたりの再生間隔。スナップショットは約 10 秒ごとなので実時間ではなく早送りで見せる
const PLAY_INTERVAL_MS = 1000;

const $ = <T extends HTMLElement>(id: string) => {
	const el = document.getElementById(id);
	if (!el) throw new Error(`#${id} が見つかりません`);
	return el as T;
};

const el = <K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text?: string,
	className?: string,
): HTMLElementTagNameMap[K] => {
	const node = document.createElement(tag);
	if (text !== undefined) node.textContent = text;
	if (className) node.className = className;
	return node;
};

const today = () => dayKey(Date.now());

const navigate = (route: Route) => {
	location.hash = formatRoute(route);
};

// --- 日別一覧 ---

const dayInput = $<HTMLInputElement>("day-input");

const renderDay = (day: string, records: ComposeRecord[]) => {
	dayInput.value = day;
	$<HTMLButtonElement>("next-day").disabled = day >= today();

	const summary = summarizeDay(records);
	$("sum-sent").textContent = `${summary.sentCount} 件`;
	$("sum-total").textContent = formatDuration(summary.totalMs);
	$("sum-longest").textContent = formatDuration(summary.longestMs);
	$("sum-discarded").textContent = `${summary.discardedCount} 件`;
	$("records-caption").textContent = `${day} の記録 (${records.length} 件)`;

	const rows = toDayRows(records).map((row) => {
		const href = formatRoute({ view: "detail", day, startedAt: row.startedAt });
		const tr = el("tr");

		// 行全体をクリック可能にしつつ、キーボードではリンクで辿れるようにする
		const timeCell = el("td", undefined, "num");
		const link = el("a", row.startTime);
		link.href = href;
		timeCell.append(link);

		const outcomeCell = el("td");
		outcomeCell.append(
			el("span", OUTCOME_LABEL[row.outcome], `badge ${row.outcome}`),
		);

		tr.append(
			timeCell,
			el("td", row.duration, "num"),
			outcomeCell,
			el("td", PANE_LABEL[row.pane], "col-pane"),
			el("td", row.channel, "col-channel channel"),
			row.excerpt === ""
				? el("td", "(本文なし)", "excerpt blank")
				: el("td", row.excerpt, "excerpt"),
		);
		tr.addEventListener("click", (e) => {
			if ((e.target as Element).closest("a")) return;
			location.hash = href;
		});
		return tr;
	});
	$("record-rows").replaceChildren(...rows);
	$("empty").hidden = rows.length > 0;
};

$("prev-day").addEventListener("click", () =>
	navigate({ view: "day", day: shiftDay(dayInput.value || today(), -1) }),
);
$("next-day").addEventListener("click", () =>
	navigate({ view: "day", day: shiftDay(dayInput.value || today(), 1) }),
);
$("today").addEventListener("click", () =>
	navigate({ view: "day", day: today() }),
);
dayInput.addEventListener("change", () => {
	// 入力途中やクリアされた状態 (空文字) では移動しない
	if (dayInput.value) navigate({ view: "day", day: dayInput.value });
});

// --- 詳細とリプレイ ---

const playButton = $<HTMLButtonElement>("play");
const slider = $<HTMLInputElement>("step-slider");

let steps: ReplayStep[] = [];
let stepIndex = 0;
let timer: number | undefined;

const renderDiff = (step: ReplayStep): Node[] =>
	step.diff.map((s) =>
		s.type === "equal"
			? document.createTextNode(s.text)
			: el(s.type === "insert" ? "ins" : "del", s.text),
	);

const showStep = (index: number) => {
	stepIndex = index;
	const step = steps[index];
	slider.value = String(index);
	$("step-label").textContent = step
		? `${index + 1} / ${steps.length} ・ ${formatDuration(step.at)} 経過`
		: "履歴なし";
	$("step-text").replaceChildren(...(step ? renderDiff(step) : []));
	for (const [i, button] of $("step-list")
		.querySelectorAll("button")
		.entries()) {
		if (i === index) button.setAttribute("aria-current", "step");
		else button.removeAttribute("aria-current");
	}
};

const stopPlayback = () => {
	if (timer !== undefined) window.clearInterval(timer);
	timer = undefined;
	playButton.textContent = "▶ 再生";
	playButton.setAttribute("aria-pressed", "false");
};

const startPlayback = () => {
	showStep(playStartIndex(stepIndex, steps.length));
	playButton.textContent = "⏸ 一時停止";
	playButton.setAttribute("aria-pressed", "true");
	timer = window.setInterval(() => {
		const next = nextIndex(stepIndex, steps.length);
		if (next === null) stopPlayback();
		else showStep(next);
	}, PLAY_INTERVAL_MS);
};

playButton.addEventListener("click", () => {
	if (timer === undefined) startPlayback();
	else stopPlayback();
});
slider.addEventListener("input", () => {
	// 手で動かしたら再生は止め、操作した位置を優先する
	stopPlayback();
	showStep(Number(slider.value));
});

const renderStepList = () => {
	const items = steps.map((step, i) => {
		const button = el("button");
		button.type = "button";
		const stats = el("span", undefined, "step-stats");
		stats.append(
			el("span", `+${step.inserted}`, "plus"),
			" ",
			el("span", `−${step.deleted}`, "minus"),
		);
		const added = excerpt(insertedText(step), 40);
		button.append(
			el("span", formatDuration(step.at), "step-time"),
			stats,
			el(
				"span",
				added || (step.deleted > 0 ? "(削除のみ)" : "(変更なし)"),
				"step-excerpt",
			),
		);
		button.addEventListener("click", () => {
			stopPlayback();
			showStep(i);
		});
		const li = el("li");
		li.append(button);
		return li;
	});
	$("step-list").replaceChildren(...items);
};

// 詳細では名前と ID を併記する (同名チャンネルの見分けや Slack 側での検索用)
const withId = (name: string | undefined, id: string) =>
	name ? `${name} (${id})` : id;

const renderMeta = (r: ComposeRecord) => {
	const entries: [string, string][] = [
		["開始", formatDateTime(r.startedAt)],
		["終了", formatDateTime(r.endedAt)],
		["所要時間", formatDuration(r.durationMs)],
		["結果", OUTCOME_LABEL[r.outcome]],
		["場所", PANE_LABEL[r.pane]],
		["チーム", withId(r.teamName, r.teamId)],
		["チャンネル", withId(r.channelName, r.channelId)],
		...(r.threadTs ? [["スレッド", r.threadTs] as [string, string]] : []),
		["入力回数", `${r.inputCount} 回`],
		["文字数", `${r.length} 文字`],
		["スナップショット", `${r.snapshots?.length ?? 0} 件`],
	];
	$("detail-meta").replaceChildren(
		...entries.flatMap(([k, v]) => [el("dt", k), el("dd", v)]),
	);
};

const renderDetail = (
	route: Extract<Route, { view: "detail" }>,
	record: ComposeRecord | undefined,
) => {
	$<HTMLAnchorElement>("back-link").href = formatRoute({
		view: "day",
		day: route.day,
	});
	$("not-found").hidden = record !== undefined;
	$("detail-body").hidden = record === undefined;
	if (!record) {
		$("detail-heading").textContent = "記録の詳細";
		return;
	}

	$("detail-heading").textContent =
		`${formatDateTime(record.startedAt)} の下書き`;
	renderMeta(record);
	$("final-text").textContent = record.text ?? "";

	steps = buildSteps(record);
	slider.max = String(Math.max(0, steps.length - 1));
	slider.disabled = steps.length <= 1;
	playButton.disabled = steps.length <= 1;
	renderStepList();
	// 開くと最終状態が見えるよう末尾のステップを表示する。再生を押すと頭から流れる
	showStep(Math.max(0, steps.length - 1));
};

// --- 画面の切り替え ---

// 読み込み中に別の画面へ移った場合、古い結果で上書きしないための世代番号
let renderSeq = 0;

const render = async () => {
	const seq = ++renderSeq;
	stopPlayback();
	const route = parseRoute(location.hash, today());
	const records = await getRecordsOfDay(route.day);
	if (seq !== renderSeq) return;

	$("day-view").hidden = route.view !== "day";
	$("detail-view").hidden = route.view !== "detail";
	if (route.view === "day") {
		document.title = `${route.day} の記録 - Slack Compose Tracker`;
		renderDay(route.day, records);
	} else {
		document.title = "記録の詳細 - Slack Compose Tracker";
		renderDetail(
			route,
			records.find((r) => r.startedAt === route.startedAt),
		);
		window.scrollTo(0, 0);
	}
};

window.addEventListener("hashchange", render);

// 開いたまま Slack で送信したら一覧に反映する。詳細はリプレイ位置が飛ぶので更新しない
browser.storage.onChanged.addListener((_changes, area) => {
	if (area !== "local") return;
	if (parseRoute(location.hash, today()).view === "day") void render();
});

await render();
