import { expect, it } from "vitest";
import { elapsedLevel, formatDuration, OVER_MS, WARN_MS } from "@/lib/duration";

it.each([
	[0, "0:00"],
	[5_999, "0:05"],
	[754_000, "12:34"],
	[3_723_000, "1:02:03"],
	[-1_000, "0:00"],
])("formatDuration(%i) → %s", (ms, expected) => {
	expect(formatDuration(ms)).toBe(expected);
});

it.each([
	[0, "normal"],
	[WARN_MS - 1, "normal"],
	[WARN_MS, "warn"],
	[OVER_MS - 1, "warn"],
	[OVER_MS, "over"],
])("elapsedLevel(%i) → %s", (ms, expected) => {
	expect(elapsedLevel(ms)).toBe(expected);
});
