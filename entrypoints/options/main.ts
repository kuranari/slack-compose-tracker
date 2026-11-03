import { getSuggestSettings, setSuggestSettings } from "@/lib/suggest-settings";
import { getTemplates, setTemplates } from "@/lib/template-store";
import { normalizeTemplates, type Template } from "@/lib/templates";

const form = document.getElementById("form") as HTMLFormElement;
const enabled = document.getElementById("enabled") as HTMLInputElement;
const apiKey = document.getElementById("api-key") as HTMLInputElement;
const status = document.getElementById("status") as HTMLElement;

const settings = await getSuggestSettings();
enabled.checked = settings.enabled;
apiKey.value = settings.apiKey;

form.addEventListener("submit", async (e) => {
	e.preventDefault();
	await setSuggestSettings({
		enabled: enabled.checked,
		apiKey: apiKey.value.trim(),
	});
	status.textContent = "保存しました";
});

const templatesForm = document.getElementById(
	"templates-form",
) as HTMLFormElement;
const templatesList = document.getElementById("templates") as HTMLElement;
const templatesStatus = document.getElementById(
	"templates-status",
) as HTMLElement;

const templateRow = (template: Template) => {
	const row = document.createElement("div");
	row.className = "template";
	row.dataset.id = template.id;
	const name = document.createElement("input");
	name.className = "name";
	name.placeholder = "名前 (検索に使う)";
	name.value = template.name;
	const remove = document.createElement("button");
	remove.type = "button";
	remove.textContent = "削除";
	remove.addEventListener("click", () => row.remove());
	const body = document.createElement("textarea");
	body.className = "body";
	body.placeholder = "本文";
	body.value = template.body;
	row.append(name, remove, body);
	return row;
};

for (const template of await getTemplates()) {
	templatesList.append(templateRow(template));
}

document.getElementById("add-template")?.addEventListener("click", () => {
	const row = templateRow({ id: crypto.randomUUID(), name: "", body: "" });
	templatesList.append(row);
	row.querySelector("input")?.focus();
});

templatesForm.addEventListener("submit", async (e) => {
	e.preventDefault();
	const rows = Array.from(
		templatesList.querySelectorAll<HTMLElement>(".template"),
	);
	const templates = normalizeTemplates(
		rows.map((row) => ({
			id: row.dataset.id ?? crypto.randomUUID(),
			name: row.querySelector<HTMLInputElement>(".name")?.value ?? "",
			body: row.querySelector<HTMLTextAreaElement>(".body")?.value ?? "",
		})),
	);
	await setTemplates(templates);
	templatesList.replaceChildren(...templates.map(templateRow));
	templatesStatus.textContent = "保存しました";
});
