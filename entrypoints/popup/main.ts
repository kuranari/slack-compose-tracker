import "./style.css";
import { startOfDay, summarize, toCsv } from "@/lib/compose-record";
import { formatDuration } from "@/lib/duration";
import { getRecords } from "@/lib/record-store";

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

const records = await getRecords();
const now = Date.now();
const today = summarize(
	records.filter((r) => r.outcome === "sent" && r.endedAt >= startOfDay(now)),
);

setText("count", `${today.count} 件`);
setText("total", formatDuration(today.totalMs));
setText("longest", formatDuration(today.longestMs));
setText("all-count", `保存済みの記録: ${records.length} 件 (破棄を含む)`);

const filename = `slack-compose-records-${dateStamp(now)}`;
document.getElementById("export-json")?.addEventListener("click", () => {
	download(
		`${filename}.json`,
		"application/json",
		JSON.stringify(records, null, 2),
	);
});
document.getElementById("export-csv")?.addEventListener("click", () => {
	download(`${filename}.csv`, "text/csv", toCsv(records));
});
