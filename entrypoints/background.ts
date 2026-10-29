import { isSaveRecordMessage } from "@/lib/messages";
import { appendRecord } from "@/lib/record-store";

export default defineBackground(() => {
	browser.runtime.onMessage.addListener((message) => {
		if (!isSaveRecordMessage(message)) return;
		appendRecord(message.record).catch((err: unknown) =>
			console.error("[slack-compose-tracker] save failed", err),
		);
	});
});
