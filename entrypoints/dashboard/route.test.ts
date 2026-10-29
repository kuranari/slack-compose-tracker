import { describe, expect, it } from "vitest";
import { formatRoute, isValidDay, parseRoute, shiftDay } from "./route";

const TODAY = "2026-10-30";

describe("parseRoute", () => {
	it.each([
		["", { view: "day", day: TODAY }],
		["#", { view: "day", day: TODAY }],
		["#/2026-10-01", { view: "day", day: "2026-10-01" }],
		[
			"#/2026-10-01/1793318400000",
			{ view: "detail", day: "2026-10-01", startedAt: 1793318400000 },
		],
		["#/2026-10-01/abc", { view: "day", day: "2026-10-01" }],
		["#/2026-02-31", { view: "day", day: TODAY }],
		["#/foo", { view: "day", day: TODAY }],
	])("%j", (hash, expected) => {
		expect(parseRoute(hash, TODAY)).toEqual(expected);
	});

	it("formatRoute と往復できる", () => {
		const route = {
			view: "detail",
			day: "2026-10-01",
			startedAt: 123,
		} as const;
		expect(parseRoute(formatRoute(route), TODAY)).toEqual(route);
		expect(formatRoute({ view: "day", day: TODAY })).toBe("#/2026-10-30");
	});
});

describe("isValidDay", () => {
	it.each([
		["2026-10-30", true],
		["2024-02-29", true],
		["2026-02-29", false],
		["2026-13-01", false],
		["2026-1-1", false],
	])("%s → %s", (day, expected) => {
		expect(isValidDay(day)).toBe(expected);
	});
});

describe("shiftDay", () => {
	it.each([
		["2026-10-30", 1, "2026-10-31"],
		["2026-10-31", 1, "2026-11-01"],
		["2026-01-01", -1, "2025-12-31"],
		["2024-02-28", 1, "2024-02-29"],
	])("%s %+d → %s", (day, delta, expected) => {
		expect(shiftDay(day, delta)).toBe(expected);
	});
});
