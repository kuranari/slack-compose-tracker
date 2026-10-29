import { defineConfig } from "@playwright/test";

// direnv を通らないシェル (エディタや Claude Code の `!` など) からも動くように .env を読む。
// direnv で読み込み済みの値は上書きしない
try {
	process.loadEnvFile();
} catch {
	// .env が無ければ環境変数だけを使う
}

// 本物の Slack に対して動かすため、直列実行かつ 1 ワーカーに限定する
export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	reporter: "list",
	use: {
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "login",
			testMatch: "login.setup.ts",
			use: { headless: false },
		},
		{
			name: "e2e",
			testMatch: "*.spec.ts",
			// 画面を出すとウィンドウとフォーカスを奪って作業の邪魔になるので、既定はヘッドレス。
			// 動きを目で追いたいときだけ E2E_HEADED=1 で画面を出す
			use: { headless: process.env.E2E_HEADED !== "1" },
		},
	],
});
