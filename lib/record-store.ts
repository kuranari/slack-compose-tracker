// 記録の永続化。書き込みは background からのみ行う (複数タブの同時追記で取りこぼさないため)
import { storage } from "wxt/utils/storage";
import type { ComposeRecord } from "@/lib/compose-record";

const recordsItem = storage.defineItem<ComposeRecord[]>(
	"local:composeRecords",
	{ fallback: [] },
);

// get → set の間に別の追記が割り込まないよう直列化する
let queue: Promise<void> = Promise.resolve();

export function appendRecord(record: ComposeRecord): Promise<void> {
	queue = queue
		.catch(() => {})
		.then(async () => {
			const records = await recordsItem.getValue();
			await recordsItem.setValue([...records, record]);
		});
	return queue;
}

export function getRecords(): Promise<ComposeRecord[]> {
	return recordsItem.getValue();
}
