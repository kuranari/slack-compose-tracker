import { describe, expect, it } from "vitest";
import { parseLocation, teamNameFromTitle } from "@/lib/slack-dom";

describe("teamNameFromTitle", () => {
	it("「チャンネル - チーム - Slack」からチーム名を取る", () => {
		expect(teamNameFromTitle("kuranari（DM） - kuranari - Slack")).toBe(
			"kuranari",
		);
	});

	it("チャンネル名に区切りが含まれても末尾から数える", () => {
		expect(teamNameFromTitle("a - b - Acme - Slack")).toBe("Acme");
	});

	it("形式が違えば取らない", () => {
		expect(teamNameFromTitle("Slack")).toBeUndefined();
		expect(teamNameFromTitle("foo - bar")).toBeUndefined();
	});
});

describe("parseLocation", () => {
	it("チームとチャンネルを取る", () => {
		expect(parseLocation("/client/T1/C1")).toEqual({
			teamId: "T1",
			channelId: "C1",
			threadTs: undefined,
		});
	});

	it("チャンネルを指さない画面は null", () => {
		expect(parseLocation("/client/T1")).toBeNull();
	});
});
