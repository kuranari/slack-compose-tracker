import { getSuggestSettings, setSuggestSettings } from "@/lib/suggest-settings";

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
