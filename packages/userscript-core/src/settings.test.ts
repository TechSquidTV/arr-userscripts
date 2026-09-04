import { expect, test } from "vite-plus/test";
import { gmDeleteValue, gmGetValue, gmRegisterMenuCommand, gmSetValue } from "./gm.ts";
import { getRadarrConfig } from "./radarr-config.ts";
import { getSonarrConfig } from "./sonarr-config.ts";
import { initializeScriptSettings, loadSettings } from "./settings.ts";

interface GmTestNamespace {
  readonly deleteValue?: (key: string) => Promise<void> | void;
  readonly getValue?: (key: string, defaultValue: string) => Promise<string> | string;
  readonly registerMenuCommand?: (caption: string, onClick: () => void) => Promise<string> | string;
  readonly setValue?: (key: string, value: string) => Promise<void> | void;
}

interface GmTestGlobals {
  GM?: GmTestNamespace;
  GM_deleteValue?: (key: string) => void;
  GM_getValue?: (key: string, defaultValue: string) => string;
  GM_registerMenuCommand?: (caption: string, onClick: () => void) => void;
  GM_setValue?: (key: string, value: string) => void;
}

const defaults = { apiKey: "default-key", url: "https://arr.example.test" };

test("uses editable defaults when GM storage is unavailable", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const originalLegacyGet = globals.GM_getValue;
  const originalModern = globals.GM;
  delete globals.GM_getValue;
  delete globals.GM;

  try {
    await expect(loadSettings("settings", defaults)).resolves.toEqual(defaults);
  } finally {
    restoreStorageGlobals(globals, originalLegacyGet, originalModern);
  }
});

test("gives saved legacy settings precedence over editable defaults", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const originalLegacyGet = globals.GM_getValue;
  const originalModern = globals.GM;
  const calls: string[] = [];
  globals.GM_getValue = (key) => {
    calls.push(key);
    return '{"apiKey":"saved-key"}';
  };
  globals.GM = {
    getValue: () => '{"apiKey":"modern-key"}',
  };

  try {
    await expect(loadSettings("settings", defaults)).resolves.toEqual({
      apiKey: "saved-key",
      url: "https://arr.example.test",
    });
    expect(calls).toEqual(["settings"]);
  } finally {
    restoreStorageGlobals(globals, originalLegacyGet, originalModern);
  }
});

test("does not restore obsolete secret keys from persistent storage", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const originalLegacyGet = globals.GM_getValue;
  const originalModern = globals.GM;
  globals.GM_getValue = () => '{"url":"https://saved.example.test","token":"old-secret"}';
  delete globals.GM;

  try {
    await expect(
      loadSettings("settings", { url: "https://default.example.test" }),
    ).resolves.toEqual({
      url: "https://saved.example.test",
    });
  } finally {
    restoreStorageGlobals(globals, originalLegacyGet, originalModern);
  }
});

test("preserves an empty settings store and migrates only obsolete secret fields", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const original = captureGmGlobals(globals);
  const writes: string[] = [];
  globals.GM_getValue = () => "";
  globals.GM_setValue = (_key, value) => {
    writes.push(value);
  };
  delete globals.GM;

  try {
    await initializeScriptSettings({
      defaults: { url: "https://default.example.test" },
      fields: [],
      menuCaption: "Configure",
      storageKey: "settings",
      validate: () => undefined,
    });
    expect(writes).toEqual([]);

    globals.GM_getValue = () => '{"url":"https://saved.example.test","token":"legacy"}';
    await initializeScriptSettings({
      defaults: { url: "https://default.example.test" },
      fields: [],
      menuCaption: "Configure",
      storageKey: "settings",
      validate: () => undefined,
    });
    expect(writes).toEqual(['{"url":"https://saved.example.test"}']);
  } finally {
    restoreGmGlobals(globals, original);
  }
});

test("uses modern GM storage when the legacy API is unavailable", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const originalLegacyGet = globals.GM_getValue;
  const originalModern = globals.GM;
  delete globals.GM_getValue;
  globals.GM = {
    getValue: async () => '{"url":"https://saved.example.test"}',
  };

  try {
    await expect(loadSettings("settings", defaults)).resolves.toEqual({
      apiKey: "default-key",
      url: "https://saved.example.test",
    });
  } finally {
    restoreStorageGlobals(globals, originalLegacyGet, originalModern);
  }
});

test("validates required settings before an ARR request is made", () => {
  const sonarr = getSonarrConfig(
    {
      sonarrApiKey: "key",
      sonarrLanguageProfileId: "",
      sonarrMonitored: "true",
      sonarrQualityProfileId: "0",
      sonarrRootFolder: "/tv",
      sonarrSearchForMissingEpisodes: "true",
      sonarrUrl: "https://sonarr.example.test",
    },
    "key",
  );
  const radarr = getRadarrConfig(
    {
      radarrApiKey: "key",
      radarrMonitored: "true",
      radarrQualityProfileId: "1",
      radarrRootFolder: "",
      radarrSearchForMovie: "true",
      radarrUrl: "https://radarr.example.test",
    },
    "key",
  );

  expect(sonarr).toBeInstanceOf(Error);
  expect(radarr).toBeInstanceOf(Error);
});

test("uses legacy GM APIs to save, reset, and register settings controls", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const original = captureGmGlobals(globals);
  const stored = new Map<string, string>();
  let caption = "";
  let menuAction: (() => void) | undefined;
  globals.GM_deleteValue = (key) => {
    stored.delete(key);
  };
  globals.GM_getValue = (key, fallback) => stored.get(key) ?? fallback;
  globals.GM_registerMenuCommand = (nextCaption, action) => {
    caption = nextCaption;
    menuAction = action;
  };
  globals.GM_setValue = (key, value) => {
    stored.set(key, value);
  };
  delete globals.GM;

  try {
    expect(await gmSetValue("settings", "saved")).toBe(true);
    expect(await gmGetValue("settings")).toBe("saved");
    expect(gmRegisterMenuCommand("Configure", () => undefined)).toBe(true);
    expect(caption).toBe("Configure");
    expect(menuAction).toBeTypeOf("function");
    expect(await gmDeleteValue("settings")).toBe(true);
    expect(await gmGetValue("settings")).toBe("");
  } finally {
    restoreGmGlobals(globals, original);
  }
});

test("uses modern GM APIs when legacy APIs are unavailable", async () => {
  const globals = globalThis as typeof globalThis & GmTestGlobals;
  const original = captureGmGlobals(globals);
  const stored = new Map<string, string>();
  let menuAction: (() => void) | undefined;
  delete globals.GM_deleteValue;
  delete globals.GM_getValue;
  delete globals.GM_registerMenuCommand;
  delete globals.GM_setValue;
  globals.GM = {
    deleteValue: async (key) => {
      stored.delete(key);
    },
    getValue: async (key, fallback) => stored.get(key) ?? fallback,
    registerMenuCommand: (_caption, action) => {
      menuAction = action;
      return "menu-id";
    },
    setValue: async (key, value) => {
      stored.set(key, value);
    },
  };

  try {
    expect(await gmSetValue("settings", "saved")).toBe(true);
    expect(await gmGetValue("settings")).toBe("saved");
    expect(gmRegisterMenuCommand("Configure", () => undefined)).toBe(true);
    expect(menuAction).toBeTypeOf("function");
    expect(await gmDeleteValue("settings")).toBe(true);
    expect(await gmGetValue("settings")).toBe("");
  } finally {
    restoreGmGlobals(globals, original);
  }
});

interface GmGlobalSnapshot {
  readonly legacyDelete: GmTestGlobals["GM_deleteValue"];
  readonly legacyGet: GmTestGlobals["GM_getValue"];
  readonly legacyMenu: GmTestGlobals["GM_registerMenuCommand"];
  readonly legacySet: GmTestGlobals["GM_setValue"];
  readonly modern: GmTestGlobals["GM"];
}

function captureGmGlobals(globals: typeof globalThis & GmTestGlobals): GmGlobalSnapshot {
  return {
    legacyDelete: globals.GM_deleteValue,
    legacyGet: globals.GM_getValue,
    legacyMenu: globals.GM_registerMenuCommand,
    legacySet: globals.GM_setValue,
    modern: globals.GM,
  };
}

function restoreGmGlobals(
  globals: typeof globalThis & GmTestGlobals,
  snapshot: GmGlobalSnapshot,
): void {
  restoreOptionalGlobal(globals, "GM_deleteValue", snapshot.legacyDelete);
  restoreOptionalGlobal(globals, "GM_getValue", snapshot.legacyGet);
  restoreOptionalGlobal(globals, "GM_registerMenuCommand", snapshot.legacyMenu);
  restoreOptionalGlobal(globals, "GM_setValue", snapshot.legacySet);
  restoreOptionalGlobal(globals, "GM", snapshot.modern);
}

function restoreOptionalGlobal<Key extends keyof GmTestGlobals>(
  globals: typeof globalThis & GmTestGlobals,
  key: Key,
  value: GmTestGlobals[Key],
): void {
  if (value === undefined) {
    delete globals[key];
  } else {
    Object.assign(globals, { [key]: value });
  }
}

function restoreStorageGlobals(
  globals: typeof globalThis & GmTestGlobals,
  legacyGetValue: GmTestGlobals["GM_getValue"],
  modernNamespace: GmTestGlobals["GM"],
): void {
  if (legacyGetValue === undefined) {
    delete globals.GM_getValue;
  } else {
    globals.GM_getValue = legacyGetValue;
  }

  if (modernNamespace === undefined) {
    delete globals.GM;
  } else {
    globals.GM = modernNamespace;
  }
}
