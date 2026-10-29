import { expect, it } from "vitest";
import { formatDuration } from "@/lib/duration";

it.each([
	[0, "0:00"],
	[5_999, "0:05"],
	[754_000, "12:34"],
	[3_723_000, "1:02:03"],
	[-1_000, "0:00"],
])("formatDuration(%i) → %s", (ms, expected) => {
	expect(formatDuration(ms)).toBe(expected);
});
