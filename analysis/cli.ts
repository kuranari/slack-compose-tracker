// 使い方: npm run analyze -- <records.jsonl> [--out <report.md>] [--top N]
// ファイルの読み書きだけを担う IO 層。分析とレポートの中身は report.ts 以下の純粋関数に任せる
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseJsonl } from "./jsonl.ts";
import { renderReport } from "./report.ts";

const USAGE =
	"使い方: npm run analyze -- <records.jsonl> [--out <report.md>] [--top N]";

const main = (): number => {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			out: { type: "string" },
			top: { type: "string", default: "10" },
			help: { type: "boolean", short: "h" },
		},
	});
	const [input] = positionals;
	if (values.help || !input) {
		console.error(USAGE);
		return values.help ? 0 : 1;
	}
	const top = Number(values.top);
	if (!Number.isInteger(top) || top < 0) {
		console.error(`--top には 0 以上の整数を指定してください: ${values.top}`);
		return 1;
	}

	const { records, errors } = parseJsonl(readFileSync(input, "utf8"));
	for (const e of errors) {
		console.error(`${input}:${e.line}: 読み飛ばしました (${e.message})`);
	}
	const report = renderReport(records, { top });
	if (values.out) {
		writeFileSync(values.out, `${report}\n`);
		console.error(
			`${records.length} 件を分析し ${values.out} に書き出しました`,
		);
	} else {
		process.stdout.write(`${report}\n`);
	}
	return 0;
};

process.exitCode = main();
