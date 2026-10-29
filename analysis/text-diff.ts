// 2 つの全文の文字単位の差分。
// diff パッケージを入れずに自前で持つのは、比較対象が 10 秒間隔の短いメッセージ同士で
// 「共通の先頭/末尾を除いた残りに LCS」で十分なうえ、Node のネイティブ型除去で
// そのまま動く依存ゼロの CLI にしておきたいから。

export type DiffOp =
	| { kind: "equal"; text: string }
	| { kind: "delete"; text: string }
	| { kind: "insert"; text: string };

// LCS 表の上限 (セル数)。超えたら中間部分を丸ごと置換として扱い、精度より停止を優先する
const MAX_LCS_CELLS = 4_000_000;

// 絵文字などのサロゲートペアを壊さないよう、コードポイント単位で比較する
const chars = (s: string): string[] => Array.from(s);

export function commonPrefixLength(
	a: readonly string[],
	b: readonly string[],
): number {
	const max = Math.min(a.length, b.length);
	let i = 0;
	while (i < max && a[i] === b[i]) i++;
	return i;
}

export function commonSuffixLength(
	a: readonly string[],
	b: readonly string[],
	prefix: number,
): number {
	const max = Math.min(a.length, b.length) - prefix;
	let i = 0;
	while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
	return i;
}

const lcsOps = (a: readonly string[], b: readonly string[]): DiffOp[] => {
	if (a.length === 0 && b.length === 0) return [];
	if (a.length * b.length > MAX_LCS_CELLS) {
		return [
			...(a.length > 0 ? [{ kind: "delete" as const, text: a.join("") }] : []),
			...(b.length > 0 ? [{ kind: "insert" as const, text: b.join("") }] : []),
		];
	}
	const w = b.length + 1;
	// table[i * w + j] = a[i:] と b[j:] の LCS 長
	const table = new Uint32Array((a.length + 1) * w);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i * w + j] =
				a[i] === b[j]
					? (table[(i + 1) * w + j + 1] ?? 0) + 1
					: Math.max(table[(i + 1) * w + j] ?? 0, table[i * w + j + 1] ?? 0);
		}
	}
	const ops: DiffOp[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			pushOp(ops, "equal", a[i] ?? "");
			i++;
			j++;
		} else if (
			j < b.length &&
			(i === a.length ||
				(table[i * w + j + 1] ?? 0) > (table[(i + 1) * w + j] ?? 0))
		) {
			pushOp(ops, "insert", b[j] ?? "");
			j++;
		} else {
			pushOp(ops, "delete", a[i] ?? "");
			i++;
		}
	}
	return ops;
};

// 同じ種類が続いたら連結し、「1 回の削除 = 1 つの塊」として数えられるようにする
const pushOp = (ops: DiffOp[], kind: DiffOp["kind"], text: string): void => {
	const last = ops.at(-1);
	if (last?.kind === kind) {
		last.text += text;
	} else {
		ops.push({ kind, text });
	}
};

// 削除と挿入が隣り合うときは delete を先に並べ、[-旧-]{+新+} の順で読めるようにする
const normalize = (ops: readonly DiffOp[]): DiffOp[] => {
	const out: DiffOp[] = [];
	let pendingDelete = "";
	let pendingInsert = "";
	const flush = () => {
		if (pendingDelete) pushOp(out, "delete", pendingDelete);
		if (pendingInsert) pushOp(out, "insert", pendingInsert);
		pendingDelete = "";
		pendingInsert = "";
	};
	for (const op of ops) {
		if (op.kind === "equal") {
			flush();
			pushOp(out, "equal", op.text);
		} else if (op.kind === "delete") {
			pendingDelete += op.text;
		} else {
			pendingInsert += op.text;
		}
	}
	flush();
	return out;
};

export function diffText(before: string, after: string): DiffOp[] {
	const a = chars(before);
	const b = chars(after);
	const prefix = commonPrefixLength(a, b);
	const suffix = commonSuffixLength(a, b, prefix);
	const ops: DiffOp[] = [];
	if (prefix > 0)
		ops.push({ kind: "equal", text: a.slice(0, prefix).join("") });
	ops.push(
		...lcsOps(
			a.slice(prefix, a.length - suffix),
			b.slice(prefix, b.length - suffix),
		),
	);
	if (suffix > 0) {
		pushOp(ops, "equal", a.slice(a.length - suffix).join(""));
	}
	return normalize(ops);
}
