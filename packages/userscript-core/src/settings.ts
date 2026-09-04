import { gmDeleteValue, gmGetValue, gmRegisterMenuCommand, gmSetValue } from "./gm.ts";

export type SettingsValues = Readonly<Record<string, string>>;

type ParsedJson =
  | boolean
  | null
  | number
  | string
  | readonly ParsedJson[]
  | { readonly [key: string]: ParsedJson };

export interface SettingsField {
  readonly key: string;
  readonly label: string;
  readonly type: "checkbox" | "password" | "text";
}

export interface SessionSecretField {
  readonly key: string;
  readonly label: string;
}

export interface ScriptSettingsOptions {
  readonly defaults: SettingsValues;
  readonly fields: readonly SettingsField[];
  readonly menuCaption: string;
  readonly storageKey: string;
  readonly validate: (values: SettingsValues) => Error | undefined;
}

export async function initializeScriptSettings(
  options: ScriptSettingsOptions,
): Promise<SettingsValues> {
  const loadedSettings = await loadSettingsDocument(options.storageKey, options.defaults);

  if (loadedSettings.requiresMigration) {
    void gmSetValue(options.storageKey, JSON.stringify(loadedSettings.values));
  }

  gmRegisterMenuCommand(options.menuCaption, () => {
    showSettingsDialog(options);
  });
  return loadedSettings.values;
}

export async function loadSettings(
  storageKey: string,
  defaults: SettingsValues,
): Promise<SettingsValues> {
  return (await loadSettingsDocument(storageKey, defaults)).values;
}

interface LoadedSettings {
  readonly requiresMigration: boolean;
  readonly values: SettingsValues;
}

async function loadSettingsDocument(
  storageKey: string,
  defaults: SettingsValues,
): Promise<LoadedSettings> {
  try {
    const serialized = await gmGetValue(storageKey);
    const storedValues = serialized === undefined ? undefined : parseSettingsValues(serialized);

    if (storedValues === undefined) {
      return { requiresMigration: false, values: defaults };
    }

    return {
      requiresMigration: Object.keys(storedValues).some((key) => !(key in defaults)),
      values: mergeStoredSettings(defaults, storedValues),
    };
  } catch {
    return { requiresMigration: false, values: defaults };
  }
}

function showSettingsDialog(options: ScriptSettingsOptions): void {
  const dialog = document.createElement("dialog");
  const form = document.createElement("form");
  const heading = document.createElement("h2");
  const description = document.createElement("p");
  const status = document.createElement("p");
  const fields = new Map<string, HTMLInputElement>();
  const currentValuesPromise = loadSettings(options.storageKey, options.defaults);

  dialog.style.border = "1px solid #555";
  dialog.style.borderRadius = "8px";
  dialog.style.color = "#111";
  dialog.style.maxWidth = "480px";
  dialog.style.padding = "24px";
  form.style.display = "grid";
  form.style.gap = "12px";
  heading.textContent = options.menuCaption;
  description.textContent =
    "Saved values override the editable defaults. API keys and tokens are requested separately for each page and are never stored.";
  status.setAttribute("role", "alert");

  form.append(heading, description);

  for (const field of options.fields) {
    const label = document.createElement("label");
    const input = document.createElement("input");

    label.style.display = "grid";
    label.style.gap = "4px";
    label.textContent = field.label;
    input.name = field.key;
    input.type = field.type;

    if (field.type !== "checkbox") {
      input.style.boxSizing = "border-box";
      input.style.width = "100%";
    }

    fields.set(field.key, input);
    label.append(input);
    form.append(label);
  }

  const controls = document.createElement("div");
  const cancelButton = createDialogButton("Cancel");
  const resetButton = createDialogButton("Reset saved settings");
  const saveButton = createDialogButton("Save");
  saveButton.type = "submit";
  controls.style.display = "flex";
  controls.style.flexWrap = "wrap";
  controls.style.gap = "8px";
  controls.append(cancelButton, resetButton, saveButton);
  form.append(status, controls);
  dialog.append(form);
  document.body.append(dialog);

  void currentValuesPromise.then((values) => {
    for (const field of options.fields) {
      const input = fields.get(field.key);

      if (input === undefined) {
        continue;
      }

      const value = values[field.key] ?? "";

      if (field.type === "checkbox") {
        input.checked = value === "true";
      } else {
        input.value = value;
      }
    }
  });

  cancelButton.addEventListener("click", () => {
    dialog.close();
  });
  resetButton.addEventListener("click", () => {
    void resetSettings(options.storageKey, status);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSettings(options, fields, status);
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
  });
  dialog.showModal();
}

export async function requestSessionSecrets(
  title: string,
  fields: readonly SessionSecretField[],
): Promise<SettingsValues | undefined> {
  if (fields.length === 0) {
    return {};
  }

  if (typeof HTMLDialogElement === "undefined") {
    return requestSecretsWithPrompt(fields);
  }

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    const description = document.createElement("p");
    const inputs = new Map<string, HTMLInputElement>();
    let settled = false;

    dialog.style.border = "1px solid #555";
    dialog.style.borderRadius = "8px";
    dialog.style.color = "#111";
    dialog.style.maxWidth = "480px";
    dialog.style.padding = "24px";
    form.style.display = "grid";
    form.style.gap = "12px";
    heading.textContent = title;
    description.textContent =
      "These credentials stay only in memory until this page is closed or reloaded. They are never saved by this userscript.";
    form.append(heading, description);

    for (const field of fields) {
      const label = document.createElement("label");
      const input = document.createElement("input");

      label.style.display = "grid";
      label.style.gap = "4px";
      label.textContent = field.label;
      input.autocomplete = "current-password";
      input.name = field.key;
      input.type = "password";
      input.style.boxSizing = "border-box";
      input.style.width = "100%";
      inputs.set(field.key, input);
      label.append(input);
      form.append(label);
    }

    const controls = document.createElement("div");
    const cancelButton = createDialogButton("Cancel");
    const continueButton = createDialogButton("Continue");
    continueButton.type = "submit";
    controls.style.display = "flex";
    controls.style.gap = "8px";
    controls.append(cancelButton, continueButton);
    form.append(controls);
    dialog.append(form);
    document.body.append(dialog);

    const finish = (values: SettingsValues | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      dialog.close();
      dialog.remove();
      resolve(values);
    };

    cancelButton.addEventListener("click", () => {
      finish(undefined);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(undefined);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values: Record<string, string> = {};

      for (const field of fields) {
        values[field.key] = inputs.get(field.key)?.value.trim() ?? "";
      }

      finish(values);
    });
    dialog.showModal();
  });
}

function createDialogButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
}

function getDialogValues(
  fields: ReadonlyMap<string, HTMLInputElement>,
  definitions: readonly SettingsField[],
): SettingsValues {
  const values: Record<string, string> = {};

  for (const definition of definitions) {
    const input = fields.get(definition.key);

    if (input === undefined) {
      continue;
    }

    values[definition.key] =
      definition.type === "checkbox" ? String(input.checked) : input.value.trim();
  }

  return values;
}

function parseSettingsValues(value: string): SettingsValues | undefined {
  if (value.length === 0) {
    return undefined;
  }

  try {
    const parsed: ParsedJson = JSON.parse(value);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !isStringRecord(parsed)
    ) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function isStringRecord(value: object): value is Record<string, string> {
  return Object.values(value).every((entry) => typeof entry === "string");
}

function mergeStoredSettings(
  defaults: SettingsValues,
  storedValues: SettingsValues,
): SettingsValues {
  const values: Record<string, string> = { ...defaults };

  for (const key of Object.keys(defaults)) {
    const storedValue = storedValues[key];

    if (storedValue !== undefined) {
      values[key] = storedValue;
    }
  }

  return values;
}

function requestSecretsWithPrompt(
  fields: readonly SessionSecretField[],
): SettingsValues | undefined {
  const values: Record<string, string> = {};

  for (const field of fields) {
    const value = window.prompt(`${field.label} (used for this page only)`, "");

    if (value === null) {
      return undefined;
    }

    values[field.key] = value.trim();
  }

  return values;
}

async function resetSettings(storageKey: string, status: HTMLElement): Promise<void> {
  if (!(await gmDeleteValue(storageKey))) {
    status.textContent = "Saved settings are unavailable in this userscript manager.";
    return;
  }

  window.location.reload();
}

async function saveSettings(
  options: ScriptSettingsOptions,
  fields: ReadonlyMap<string, HTMLInputElement>,
  status: HTMLElement,
): Promise<void> {
  const values = getDialogValues(fields, options.fields);
  const validationError = options.validate(values);

  if (validationError !== undefined) {
    status.textContent = validationError.message;
    return;
  }

  if (!(await gmSetValue(options.storageKey, JSON.stringify(values)))) {
    status.textContent = "Saved settings are unavailable in this userscript manager.";
    return;
  }

  window.location.reload();
}
