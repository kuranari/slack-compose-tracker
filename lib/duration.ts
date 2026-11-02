// 例: 5_000 → "0:05", 754_000 → "12:34", 3_723_000 → "1:02:03"
export function formatDuration(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// 入力時間の目安。長引いていることに書きながら気づけるよう、バッジの色を段階的に変える
export const WARN_MS = 5 * 60_000;
export const OVER_MS = 10 * 60_000;

export type ElapsedLevel = "normal" | "warn" | "over";

export function elapsedLevel(ms: number): ElapsedLevel {
	if (ms >= OVER_MS) return "over";
	if (ms >= WARN_MS) return "warn";
	return "normal";
}
