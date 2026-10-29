// 画面の状態を URL のハッシュで表す。ブラウザの戻る/進むやリロードで同じ画面に戻れるように
//   #/2026-10-30                 → その日の一覧
//   #/2026-10-30/1793318400000   → その日の、startedAt が一致する記録の詳細

export type Route =
	| { view: "day"; day: string }
	| { view: "detail"; day: string; startedAt: number };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 形式は呼び出し側で確認済みの前提。欠けていたら NaN になり Invalid Date として扱われる
const splitDay = (day: string): [number, number, number] => {
	const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = day
		.split("-")
		.map(Number);
	return [y, m, d];
};

export function isValidDay(day: string): boolean {
	if (!DAY_PATTERN.test(day)) return false;
	const [y, m, d] = splitDay(day);
	const date = new Date(y, m - 1, d);
	// "2026-02-31" のような繰り上がる日付を弾く
	return (
		date.getFullYear() === y &&
		date.getMonth() === m - 1 &&
		date.getDate() === d
	);
}

// 解釈できないハッシュは今日の一覧に倒す
export function parseRoute(hash: string, today: string): Route {
	const [day, startedAt] = hash.replace(/^#\/?/, "").split("/");
	if (!day || !isValidDay(day)) return { view: "day", day: today };
	if (startedAt !== undefined && /^\d+$/.test(startedAt)) {
		return { view: "detail", day, startedAt: Number(startedAt) };
	}
	return { view: "day", day };
}

export function formatRoute(route: Route): string {
	return route.view === "day"
		? `#/${route.day}`
		: `#/${route.day}/${route.startedAt}`;
}

// 日付キーを前後に動かす。DST の切り替えで日付がずれないよう正午を基準にする
export function shiftDay(day: string, delta: number): string {
	const [y, m, d] = splitDay(day);
	const date = new Date(y, m - 1, d + delta, 12);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
