import { describe, expect, it } from "vitest";
import type { ComposeRecord } from "@/lib/compose-record";
import {
	buildSteps,
	insertedText,
	nextIndex,
	playStartIndex,
	type ReplayStep,
} from "./replay";

// noUncheckedIndexedAccess 下でテストを簡潔に書くため
const stepAt = (steps: ReplayStep[], i: number): ReplayStep => {
	const step = steps[i];
	if (!step) throw new Error(`step ${i} がありません`);
	return step;
};

const record = (overrides: Partial<ComposeRecord> = {}): ComposeRecord => ({
	teamId: "T1",
	channelId: "C1",
	pane: "channel",
	startedAt: 0,
	endedAt: 25_000,
	durationMs: 25_000,
	inputCount: 12,
	length: 5,
	outcome: "sent",
	text: "hello",
	snapshots: [
		{ at: 0, text: "h" },
		{ at: 10_000, text: "help" },
		{ at: 25_000, text: "hello" },
	],
	...overrides,
});

describe("buildSteps", () => {
	it("各ステップに直前との差分を付ける (最初は空文字との差分)", () => {
		const steps = buildSteps(record());
		expect(steps.map((s) => s.at)).toEqual([0, 10_000, 25_000]);
		expect(stepAt(steps, 0).diff).toEqual([{ type: "insert", text: "h" }]);
		expect(stepAt(steps, 2)).toEqual({
			at: 25_000,
			text: "hello",
			diff: [
				{ type: "equal", text: "hel" },
				{ type: "delete", text: "p" },
				{ type: "insert", text: "lo" },
			],
			inserted: 2,
			deleted: 1,
		});
	});

	it("最終テキストがスナップショットに無ければ終了時点のステップを足す", () => {
		const steps = buildSteps(
			record({ snapshots: [{ at: 0, text: "h" }], text: "hi" }),
		);
		expect(steps.map((s) => [s.at, s.text])).toEqual([
			[0, "h"],
			[25_000, "hi"],
		]);
	});

	it("snapshots の無い古い記録は最終テキストだけのステップになる", () => {
		const old = record();
		delete (old as Partial<ComposeRecord>).snapshots;
		expect(buildSteps(old).map((s) => s.text)).toEqual(["hello"]);
	});

	it("text も snapshots も無ければステップなし", () => {
		const old = record();
		delete (old as Partial<ComposeRecord>).snapshots;
		delete (old as Partial<ComposeRecord>).text;
		expect(buildSteps(old)).toEqual([]);
	});
});

describe("insertedText", () => {
	it("挿入された部分だけをつなげる", () => {
		expect(insertedText(stepAt(buildSteps(record()), 2))).toBe("lo");
	});
});

describe("nextIndex / playStartIndex", () => {
	it("末尾までは 1 つ進み、末尾で null", () => {
		expect(nextIndex(0, 3)).toBe(1);
		expect(nextIndex(2, 3)).toBeNull();
	});

	it("末尾で再生を押したら頭から", () => {
		expect(playStartIndex(1, 3)).toBe(1);
		expect(playStartIndex(2, 3)).toBe(0);
	});
});
