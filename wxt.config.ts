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
		// 拡張機能 ID を固定する公開鍵 (ID: andgbpomldibkaoklgpnnomddfmdhfpj)。
		// 手で読み込む拡張の ID は本来フォルダのパスで決まり、storage も ID ごとに分かれる。
		// 2 台の端末や開発用/本番用ビルドでパスが違っても、記録を同じ拡張のものとして扱うため。
		// 秘密鍵は keys/ (gitignore 済み) にあるが、手で読み込む用途では使わない
		key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAswX71Q6HSaHukcqaMgeDwKqdAXZtdWfFWEPmtb5yUfA0epPWnPA1K2Rw4kgrqMgi4nlTyQ1aFCxgtdhfNAbc9JnzGYXEU3Q9LVIIAt315iFhTwdWQ3dhTF72WVdC5pF0QaGWkCf9sa9QOYsG+rB/fnZmu4EgplToqwymF4QJzuiLvCURkb+S7IUtpdnA7es61W0Dink0iCEvy9i/Y5apb6PV/L8uJ/ifHdFZMZXAGtbr2LvjgXrIcRNW+JLnwqfWzh6mDR3Dgx+KChGORMJnVqGk2Qdsl3fpz2ldjOKub7/8txiEhbO2lMt+ptuEAFroXA0GKvUrYA1mzuekDOjMvwIDAQAB",
	},
});
