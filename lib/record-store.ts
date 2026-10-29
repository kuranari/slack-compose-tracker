// 記録の永続化。書き込みは background からのみ行う (複数タブの同時追記で取りこぼさないため)
// 本文と文字の履歴で 1 件が大きくなるので、日付ごとのキーに分けて 1 回の書き込みを小さく保つ
import { storage } from "wxt/utils/storage";
import { type ComposeRecord, dayKey } from "@/lib/compose-record";

const KEY_PREFIX = "records:";

const itemKey = (day: string) => `local:${KEY_PREFIX}${day}` as const;

// get → set の間に別の追記が割り込まないよう直列化する
let queue: Promise<void> = Promise.resolve();

export function appendRecord(record: ComposeRecord): Promise<void> {
	queue = queue
		.catch(() => {})
		.then(async () => {
			const key = itemKey(dayKey(record.endedAt));
			const records = await storage.getItem<ComposeRecord[]>(key, {
				fallback: [],
			});
			await storage.setItem(key, [...records, record]);
		});
	return queue;
}

export function getRecordsOfDay(day: string): Promise<ComposeRecord[]> {
	return storage.getItem<ComposeRecord[]>(itemKey(day), { fallback: [] });
}

export async function getAllRecords(): Promise<ComposeRecord[]> {
	const all = await storage.snapshot("local");
	return Object.keys(all)
		.filter((key) => key.startsWith(KEY_PREFIX))
		.sort()
		.flatMap((key) => all[key] as ComposeRecord[]);
}
