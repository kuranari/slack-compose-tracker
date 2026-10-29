import { defineConfig } from "wxt";

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
	// ドット始まりだと Chrome の「パッケージ化されていない拡張機能を読み込む」で選べないため
	outDir: "output",
	manifest: {
		name: "Slack Compose Tracker",
		description: "Slackメッセージ作成時間トラッカー",
		// 本文と文字の履歴を残すため storage.local の 10MB 上限を外す
		permissions: ["storage", "unlimitedStorage"],
	},
});
