import { describe, expect, it } from "vitest";
import { makeRecord } from "./fixtures.ts";
import { parseJsonl } from "./jsonl.ts";

describe("parseJsonl", () => {
	it("空行を無視し、壊れた行と形式違いの行を行番号付きで返す", () => {
		const record = makeRecord([{ at: 0, text: "a" }]);
		const content = [
			JSON.stringify(record),
			"",
			"{broken",
			JSON.stringify({ foo: 1 }),
		].join("\n");
		const { records, errors } = parseJsonl(content);
		expect(records).toEqual([record]);
		expect(errors.map((e) => e.line)).toEqual([3, 4]);
	});
});
