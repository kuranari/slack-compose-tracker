// 定型文の保存。2 台で共有しない (ユーザー指定) ので storage.local に置く
import { storage } from "wxt/utils/storage";
import type { Template } from "@/lib/templates";

const KEY = "local:templates";

export function getTemplates(): Promise<Template[]> {
	return storage.getItem<Template[]>(KEY, { fallback: [] });
}

export function setTemplates(templates: readonly Template[]): Promise<void> {
	return storage.setItem(KEY, templates);
}

export function watchTemplates(
	cb: (templates: Template[]) => void,
): () => void {
	return storage.watch<Template[]>(KEY, (templates) => cb(templates ?? []));
}
