// content script → background のメッセージ
import type { ComposeRecord } from "@/lib/compose-record";

export type SaveRecordMessage = {
	type: "save-record";
	record: ComposeRecord;
};

export function saveRecordMessage(record: ComposeRecord): SaveRecordMessage {
	return { type: "save-record", record };
}

export function isSaveRecordMessage(
	message: unknown,
): message is SaveRecordMessage {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { type?: unknown }).type === "save-record"
	);
}
