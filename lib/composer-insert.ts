// 入力欄のカーソルの位置に Markdown の文を入れる。Quill の DOM には書き込まず、
// 貼り付けのイベントを送って Slack 自身の貼り付け処理に任せる。Slack は Markdown の
// テキストの貼り付けを書式に変え、選んだ範囲があれば置き換える (2026-11-03 に確認)
export function insertIntoComposer(
	composer: HTMLElement,
	text: string,
	range: Range | null,
): void {
	composer.focus();
	// 一覧を開いてフォーカスが外れる前のカーソルの位置に戻す
	if (range && composer.contains(range.commonAncestorContainer)) {
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}
	const data = new DataTransfer();
	data.setData("text/plain", text);
	composer.dispatchEvent(
		new ClipboardEvent("paste", {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		}),
	);
}

// 一覧を開く前に、入力欄の中のカーソルの位置を覚えておく
export function composerRange(composer: HTMLElement): Range | null {
	const selection = document.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	return composer.contains(range.commonAncestorContainer)
		? range.cloneRange()
		: null;
}
