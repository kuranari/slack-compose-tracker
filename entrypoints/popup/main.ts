import "./style.css";
import { dayKey, summarize, toCsv, toJsonl } from "@/lib/compose-record";
import { formatDuration } from "@/lib/duration";
import { getAllRecords, getRecordsOfDay } from "@/lib/record-store";

const setText = (id: string, text: string) => {
	const el = document.getElementById(id);
	if (el) el.textContent = text;
};

const download = (filename: string, type: string, body: string) => {
	const url = URL.createObjectURL(new Blob([body], { type }));
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
};

const dateStamp = (now: number) => {
	const d = new Date(now);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

const now = Date.now();
const todayRecords = await getRecordsOfDay(dayKey(now));
const today = summarize(todayRecords.filter((r) => r.outcome === "sent"));

setText("count", `${today.count} 件`);
setText("total", formatDuration(today.totalMs));
setText("longest", formatDuration(today.longestMs));
setText("all-count", `今日の記録: ${todayRecords.length} 件 (破棄を含む)`);

// 書き出しは全期間。JSONL は 1 行 1 下書きで文字の履歴を含む (AI と分析する用)
const filename = `slack-compose-records-${dateStamp(now)}`;
document.getElementById("export-jsonl")?.addEventListener("click", async () => {
	const records = await getAllRecords();
	download(`${filename}.jsonl`, "application/x-ndjson", toJsonl(records));
});
document.getElementById("export-csv")?.addEventListener("click", async () => {
	const records = await getAllRecords();
	download(`${filename}.csv`, "text/csv", toCsv(records));
});
