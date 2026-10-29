// 2 つのテキストの文字単位の差分 (LCS)。リプレイで「前のスナップショットから何が変わったか」を示す
// lib/ に置かないのは、共通化の判断を PM が後でまとめて行うため

export type DiffSegment = {
	type: "equal" | "insert" | "delete";
	text: string;
};

// LCS の表は (n+1)(m+1) 要素になる。メッセージは短い前提だが、長文を貼り付けた場合に
// タブが固まらないよう上限を超えたら「全部消して全部足した」扱いに倒す
const MAX_TABLE_CELLS = 2_000_000;

export function diffChars(before: string, after: string): DiffSegment[] {
	// サロゲートペア (絵文字など) を途中で割らないよう code point 単位で比べる
	const a = Array.from(before);
	const b = Array.from(after);

	// 入力は末尾や途中への追記が大半なので、共通の前後を先に除いて表を小さくする
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
		prefix++;
	}
	let suffix = 0;
	while (
		suffix < a.length - prefix &&
		suffix < b.length - prefix &&
		a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
	) {
		suffix++;
	}

	const midA = a.slice(prefix, a.length - suffix);
	const midB = b.slice(prefix, b.length - suffix);

	const segments: DiffSegment[] = [];
	push(segments, "equal", a.slice(0, prefix).join(""));
	for (const s of diffMiddle(midA, midB)) push(segments, s.type, s.text);
	push(segments, "equal", a.slice(a.length - suffix).join(""));
	return segments;
}

function diffMiddle(a: string[], b: string[]): DiffSegment[] {
	const n = a.length;
	const m = b.length;
	if ((n + 1) * (m + 1) > MAX_TABLE_CELLS) {
		return [
			{ type: "delete", text: a.join("") },
			{ type: "insert", text: b.join("") },
		];
	}

	// lcs[i][j] = a[i..] と b[j..] の LCS 長。後ろから埋めると前から辿って出力できる
	const width = m + 1;
	const lcs = new Uint32Array((n + 1) * width);
	// 範囲内しか読まないが、noUncheckedIndexedAccess のため既定値を与える
	const len = (i: number, j: number) => lcs[i * width + j] ?? 0;
	const charA = (i: number) => a[i] ?? "";
	const charB = (j: number) => b[j] ?? "";
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i * width + j] =
				charA(i) === charB(j)
					? len(i + 1, j + 1) + 1
					: Math.max(len(i + 1, j), len(i, j + 1));
		}
	}

	const segments: DiffSegment[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (charA(i) === charB(j)) {
			push(segments, "equal", charA(i));
			i++;
			j++;
		} else if (len(i + 1, j) >= len(i, j + 1)) {
			// 同点なら削除を先に出す。置換が「消して → 足す」の順に読めるように
			push(segments, "delete", charA(i));
			i++;
		} else {
			push(segments, "insert", charB(j));
			j++;
		}
	}
	push(segments, "delete", a.slice(i).join(""));
	push(segments, "insert", b.slice(j).join(""));
	return segments;
}

// 同じ種類が続く場合は 1 つにまとめ、DOM の要素数を抑える
function push(
	segments: DiffSegment[],
	type: DiffSegment["type"],
	text: string,
): void {
	if (text === "") return;
	const last = segments.at(-1);
	if (last && last.type === type) {
		last.text += text;
	} else {
		segments.push({ type, text });
	}
}

// 挿入・削除された文字数 (code point 数)。ステップ一覧の要約に使う
export function diffStats(segments: readonly DiffSegment[]): {
	inserted: number;
	deleted: number;
} {
	let inserted = 0;
	let deleted = 0;
	for (const s of segments) {
		const len = Array.from(s.text).length;
		if (s.type === "insert") inserted += len;
		if (s.type === "delete") deleted += len;
	}
	return { inserted, deleted };
}
