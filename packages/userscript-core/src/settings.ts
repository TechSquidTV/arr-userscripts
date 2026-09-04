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
  readonly hint?: string;
  readonly key: string;
  readonly label: string;
  readonly type: "checkbox" | "password" | "text";
}

export interface SettingsSelectOption {
  readonly label: string;
  readonly value: string;
}

export type SettingsSelectOptions = Readonly<Record<string, readonly SettingsSelectOption[]>>;

export interface ServerOptionsLoader {
  readonly buttonLabel: string;
  readonly insertAfterFieldKey: string;
  readonly isReady: (values: SettingsValues) => boolean;
  readonly load: (values: SettingsValues) => Promise<SettingsSelectOptions>;
}

export interface ScriptSettingsOptions {
  readonly defaults: SettingsValues;
  readonly fields: readonly SettingsField[];
  readonly menuCaption: string;
  readonly serverOptionsLoader?: ServerOptionsLoader;
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

interface DialogShell {
  readonly dialog: HTMLDialogElement;
  readonly form: HTMLFormElement;
}

interface DialogFieldControl {
  readonly container: HTMLLabelElement;
  readonly input: HTMLInputElement;
}

type DialogButtonKind = "danger" | "primary" | "secondary";
type SettingsControl = HTMLInputElement | HTMLSelectElement;

const dialogFontFamily =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function createDialogShell(title: string, descriptionText: string): DialogShell {
  const dialog = document.createElement("dialog");
  const form = document.createElement("form");
  const heading = document.createElement("h2");
  const description = document.createElement("p");

  dialog.style.background = "#ffffff";
  dialog.style.border = "1px solid #d0d7de";
  dialog.style.borderRadius = "12px";
  dialog.style.boxShadow = "0 20px 50px rgb(15 23 42 / 28%)";
  dialog.style.color = "#1f2937";
  dialog.style.fontFamily = dialogFontFamily;
  dialog.style.maxHeight = "calc(100vh - 32px)";
  dialog.style.maxWidth = "520px";
  dialog.style.overflowY = "auto";
  dialog.style.padding = "0";
  dialog.style.width = "calc(100vw - 32px)";
  form.style.display = "grid";
  form.style.gap = "16px";
  form.style.padding = "28px";
  heading.style.color = "#111827";
  heading.style.fontSize = "20px";
  heading.style.fontWeight = "700";
  heading.style.letterSpacing = "-0.015em";
  heading.style.lineHeight = "1.25";
  heading.style.margin = "0";
  description.style.color = "#4b5563";
  description.style.fontSize = "14px";
  description.style.lineHeight = "1.5";
  description.style.margin = "-8px 0 4px";
  heading.textContent = title;
  description.textContent = descriptionText;
  form.append(heading, description);

  return { dialog, form };
}

function createDialogField(field: SettingsField): DialogFieldControl {
  const label = document.createElement("label");
  const labelText = document.createElement("span");
  const input = document.createElement("input");

  labelText.textContent = field.label;
  labelText.style.color = "#374151";
  labelText.style.fontSize = "14px";
  labelText.style.fontWeight = "600";
  labelText.style.lineHeight = "1.35";
  input.name = field.key;
  input.type = field.type;

  if (field.type === "checkbox") {
    label.style.alignItems = "center";
    label.style.cursor = "pointer";
    label.style.display = "flex";
    label.style.gap = "10px";
    input.style.accentColor = "#2563eb";
    input.style.height = "18px";
    input.style.margin = "0";
    input.style.width = "18px";
    label.append(input, labelText);
  } else {
    label.style.display = "grid";
    label.style.gap = "6px";
    styleDialogTextInput(input);
    label.append(labelText, input);
  }

  if (field.hint !== undefined) {
    const hint = document.createElement("span");

    hint.textContent = field.hint;
    hint.style.color = "#6b7280";
    hint.style.fontSize = "12px";
    hint.style.lineHeight = "1.4";
    label.append(hint);
  }

  return { container: label, input };
}

function styleDialogTextInput(input: HTMLInputElement): void {
  input.autocomplete = "off";
  input.style.background = "#ffffff";
  input.style.border = "1px solid #9ca3af";
  input.style.borderRadius = "7px";
  input.style.boxSizing = "border-box";
  input.style.color = "#111827";
  input.style.font = "inherit";
  input.style.fontSize = "15px";
  input.style.lineHeight = "1.4";
  input.style.minHeight = "40px";
  input.style.padding = "8px 10px";
  input.style.width = "100%";
  input.addEventListener("blur", () => {
    input.style.borderColor = "#9ca3af";
    input.style.boxShadow = "none";
  });
  input.addEventListener("focus", () => {
    input.style.borderColor = "#2563eb";
    input.style.boxShadow = "0 0 0 3px rgb(37 99 235 / 18%)";
  });
}

function styleDialogSelect(select: HTMLSelectElement): void {
  select.style.background = "#ffffff";
  select.style.border = "1px solid #9ca3af";
  select.style.borderRadius = "7px";
  select.style.boxSizing = "border-box";
  select.style.color = "#111827";
  select.style.font = "inherit";
  select.style.fontSize = "15px";
  select.style.lineHeight = "1.4";
  select.style.minHeight = "40px";
  select.style.padding = "8px 10px";
  select.style.width = "100%";
  select.addEventListener("blur", () => {
    select.style.borderColor = "#9ca3af";
    select.style.boxShadow = "none";
  });
  select.addEventListener("focus", () => {
    select.style.borderColor = "#2563eb";
    select.style.boxShadow = "0 0 0 3px rgb(37 99 235 / 18%)";
  });
}

function createDialogControls(): HTMLDivElement {
  const controls = document.createElement("div");

  controls.style.alignItems = "center";
  controls.style.borderTop = "1px solid #e5e7eb";
  controls.style.display = "flex";
  controls.style.flexWrap = "wrap";
  controls.style.gap = "8px";
  controls.style.justifyContent = "flex-end";
  controls.style.marginTop = "4px";
  controls.style.paddingTop = "18px";
  return controls;
}

function createDialogStatus(): HTMLParagraphElement {
  const status = document.createElement("p");

  status.setAttribute("aria-live", "polite");
  status.setAttribute("role", "alert");
  status.style.color = "#b42318";
  status.style.fontSize = "13px";
  status.style.fontWeight = "600";
  status.style.lineHeight = "1.4";
  status.style.margin = "-4px 0 0";
  status.style.minHeight = "18px";
  return status;
}

function showSettingsDialog(options: ScriptSettingsOptions): void {
  const { dialog, form } = createDialogShell(
    options.menuCaption,
    "Saved values override the editable defaults. Your API keys and optional Plex token are stored only by this userscript manager in this browser profile.",
  );
  const status = createDialogStatus();
  const fields = new Map<string, SettingsControl>();
  const currentValuesPromise = loadSettings(options.storageKey, options.defaults);
  const loadButton =
    options.serverOptionsLoader === undefined
      ? undefined
      : createServerOptionsButton(options, fields, status, currentValuesPromise);
  let loadButtonAppended = false;

  for (const field of options.fields) {
    const { container, input } = createDialogField(field);

    fields.set(field.key, input);
    form.append(container);

    if (
      loadButton !== undefined &&
      options.serverOptionsLoader?.insertAfterFieldKey === field.key
    ) {
      form.append(loadButton);
      loadButtonAppended = true;
    }
  }

  if (loadButton !== undefined && !loadButtonAppended) {
    form.append(loadButton);
  }

  const controls = createDialogControls();
  const cancelButton = createDialogButton("Cancel", "secondary");
  const resetButton = createDialogButton("Reset saved settings", "danger");
  const saveButton = createDialogButton("Save settings", "primary");
  saveButton.type = "submit";
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

      if (field.type === "checkbox" && input instanceof HTMLInputElement) {
        input.checked = value === "true";
      } else {
        input.value = value;
      }
    }

    if (options.serverOptionsLoader?.isReady(values) === true && loadButton !== undefined) {
      void loadServerOptions(options, fields, status, loadButton);
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
    void saveSettings(options, fields, status, loadButton);
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
  });
  dialog.showModal();
}

function createServerOptionsButton(
  options: ScriptSettingsOptions,
  fields: Map<string, SettingsControl>,
  status: HTMLParagraphElement,
  currentValuesPromise: Promise<SettingsValues>,
): HTMLButtonElement {
  const loader = options.serverOptionsLoader;

  if (loader === undefined) {
    throw new Error("Server options loader is required.");
  }

  const loadButton = createDialogButton(loader.buttonLabel, "secondary");

  loadButton.style.justifySelf = "start";
  loadButton.addEventListener("click", () => {
    void currentValuesPromise.then(() => loadServerOptions(options, fields, status, loadButton));
  });
  return loadButton;
}

async function loadServerOptions(
  options: ScriptSettingsOptions,
  fields: Map<string, SettingsControl>,
  status: HTMLParagraphElement,
  loadButton: HTMLButtonElement,
): Promise<boolean> {
  const loader = options.serverOptionsLoader;

  if (loader === undefined) {
    return false;
  }

  loadButton.disabled = true;

  try {
    setDialogStatus(status, "Contacting the server…", "neutral");
    const values = getDialogValues(fields, options.fields);

    if (!loader.isReady(values)) {
      setDialogStatus(status, "Enter the server URL and API key first.", "error");
      return false;
    }

    const selectOptions = await loader.load(values);
    replaceWithSelectControls(fields, selectOptions);
    setDialogStatus(
      status,
      "Server options loaded. Choose a folder and profile, then save.",
      "success",
    );
    return true;
  } catch (error) {
    setDialogStatus(
      status,
      error instanceof Error ? error.message : "Unable to load server options.",
      "error",
    );
  } finally {
    loadButton.disabled = false;
  }

  return false;
}

function replaceWithSelectControls(
  fields: Map<string, SettingsControl>,
  selectOptions: SettingsSelectOptions,
): void {
  for (const [key, choices] of Object.entries(selectOptions)) {
    const currentControl = fields.get(key);

    if (currentControl === undefined) {
      continue;
    }

    const currentValue = currentControl.value;

    if (currentControl instanceof HTMLSelectElement) {
      currentControl.replaceChildren();
      appendSelectOptions(currentControl, choices, currentValue);
      continue;
    }

    const select = document.createElement("select");

    select.name = currentControl.name;
    styleDialogSelect(select);
    appendSelectOptions(select, choices, currentValue);
    currentControl.replaceWith(select);
    fields.set(key, select);
  }
}

function appendSelectOptions(
  select: HTMLSelectElement,
  choices: readonly SettingsSelectOption[],
  currentValue: string,
): void {
  const placeholder = document.createElement("option");

  placeholder.disabled = true;
  placeholder.textContent = choices.length === 0 ? "No options found" : "Choose an option";
  placeholder.value = "";
  select.append(placeholder);

  for (const choice of choices) {
    const option = document.createElement("option");

    option.textContent = choice.label;
    option.value = choice.value;
    select.append(option);
  }

  if (choices.some((choice) => choice.value === currentValue)) {
    select.value = currentValue;
  } else if (choices.length === 1) {
    select.value = choices[0]?.value ?? "";
  } else {
    select.value = "";
  }
}

function setDialogStatus(
  status: HTMLParagraphElement,
  message: string,
  tone: "error" | "neutral" | "success",
): void {
  status.style.color = tone === "error" ? "#b42318" : tone === "success" ? "#067647" : "#4b5563";
  status.textContent = message;
}

function createDialogButton(label: string, kind: DialogButtonKind): HTMLButtonElement {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.style.border = "1px solid #d1d5db";
  button.style.borderRadius = "7px";
  button.style.cursor = "pointer";
  button.style.font = "inherit";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";
  button.style.lineHeight = "1.3";
  button.style.minHeight = "38px";
  button.style.padding = "8px 12px";

  if (kind === "primary") {
    button.style.background = "#2563eb";
    button.style.borderColor = "#2563eb";
    button.style.color = "#ffffff";
  } else if (kind === "danger") {
    button.style.background = "#fff7f7";
    button.style.borderColor = "#f3c2c2";
    button.style.color = "#b42318";
  } else {
    button.style.background = "#ffffff";
    button.style.color = "#374151";
  }

  return button;
}

function getDialogValues(
  fields: ReadonlyMap<string, SettingsControl>,
  definitions: readonly SettingsField[],
): SettingsValues {
  const values: Record<string, string> = {};

  for (const definition of definitions) {
    const input = fields.get(definition.key);

    if (input === undefined) {
      continue;
    }

    values[definition.key] =
      definition.type === "checkbox" && input instanceof HTMLInputElement
        ? String(input.checked)
        : input.value.trim();
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

async function resetSettings(storageKey: string, status: HTMLElement): Promise<void> {
  if (!(await gmDeleteValue(storageKey))) {
    status.textContent = "Saved settings are unavailable in this userscript manager.";
    return;
  }

  window.location.reload();
}

async function saveSettings(
  options: ScriptSettingsOptions,
  fields: Map<string, SettingsControl>,
  status: HTMLParagraphElement,
  loadButton: HTMLButtonElement | undefined,
): Promise<void> {
  const values = getDialogValues(fields, options.fields);
  const validationError = options.validate(values);

  if (validationError === undefined) {
    await persistSettings(options.storageKey, values, status);
    return;
  }

  const loader = options.serverOptionsLoader;

  if (loader !== undefined && loadButton !== undefined && loader.isReady(values)) {
    const persisted = await persistSettings(options.storageKey, values, status, false);

    if (!persisted) {
      return;
    }

    if (await loadServerOptions(options, fields, status, loadButton)) {
      setDialogStatus(
        status,
        "Connection saved. Choose a folder and profile, then save.",
        "success",
      );
    }
    return;
  }

  status.textContent = validationError.message;
}

async function persistSettings(
  storageKey: string,
  values: SettingsValues,
  status: HTMLElement,
  reload = true,
): Promise<boolean> {
  if (!(await gmSetValue(storageKey, JSON.stringify(values)))) {
    status.textContent = "Saved settings are unavailable in this userscript manager.";
    return false;
  }

  if (reload) {
    window.location.reload();
  }

  return true;
}
