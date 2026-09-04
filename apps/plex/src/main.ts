import {
  getSonarrConnectionConfig,
  initializeScriptSettings,
  requestSessionSecrets,
  serviceIconUrls,
  SonarrClient,
  SonarrNotFoundError,
  sonarrConnectionSettingsFields,
  sonarrSecretFields,
  type SettingsValues,
  type SonarrSeries,
} from "@arr-userscripts/core";
import { getPlexConfig, plexSecretFields, plexSettingsFields } from "./config.ts";
import { metadata } from "./metadata.ts";
import { PlexClient } from "./plex.ts";

const buttonId = "arr-userscripts-plex-sonarr-button";
const televisionIndicatorSelector = [
  '[data-testid="preplay-seasonSelector"]',
  '[data-testid^="preplay-season"]',
  '[data-testid^="preplay-episode"]',
].join(", ");

let mountInProgress = false;
let mountRequested = false;
let settings: SettingsValues;
let sessionCredentialsRequested = false;
let sessionSecrets: SettingsValues | undefined;
let plexConfiguration: ReturnType<typeof getPlexConfig>;
let plexClient: PlexClient | undefined;

declare const ARR_USERSCRIPTS_PLEX_DEFAULTS: Readonly<Record<string, string>>;

void initialize();

async function initialize(): Promise<void> {
  settings = await initializeScriptSettings({
    defaults: ARR_USERSCRIPTS_PLEX_DEFAULTS,
    fields: [...sonarrConnectionSettingsFields, ...plexSettingsFields],
    menuCaption: "Configure ARR Userscripts: Plex Sonarr",
    storageKey: "arr-userscripts/plex-sonarr/settings-v1",
    validate: (values) => {
      const sonarrConfig = getSonarrConnectionConfig(values, "session-api-key");

      if (sonarrConfig instanceof Error) {
        return sonarrConfig;
      }

      const plexConfig = getPlexConfig(
        values,
        (values.plexServerUrl ?? "").trim().length === 0 ? undefined : "session-token",
      );
      return plexConfig instanceof Error ? plexConfig : undefined;
    },
  });
  plexConfiguration = getPlexConfig(settings, undefined);
  plexClient = undefined;
  observePlexPage();
}

function observePlexPage(): void {
  const observer = new MutationObserver(requestMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestMount();
}

function requestMount(): void {
  mountRequested = true;

  if (mountInProgress) {
    return;
  }

  queueMicrotask(() => {
    if (!mountRequested || mountInProgress) {
      return;
    }

    mountRequested = false;
    void mountButton();
  });
}

async function mountButton(): Promise<void> {
  mountInProgress = true;

  try {
    if (document.getElementById(buttonId) !== null || !isPlexDetailRoute()) {
      return;
    }

    const title = getSeriesTitle();
    const target = findActionTarget();

    if (title === undefined || target === undefined || target.parentElement === null) {
      return;
    }

    const route = location.href;

    let lookupTerms = await getShowLookupTerms();

    if (lookupTerms === undefined) {
      return;
    }

    const secrets = await requestDetailSessionSecrets();

    if (secrets === undefined) {
      return;
    }

    if (plexClient !== undefined) {
      lookupTerms = await getShowLookupTerms();

      if (lookupTerms === undefined) {
        return;
      }
    }

    if (route !== location.href || document.getElementById(buttonId) !== null) {
      return;
    }

    const sonarrConnection = getSonarrConnectionConfig(settings, secrets.sonarrApiKey);

    if (sonarrConnection instanceof Error) {
      console.warn(`[${metadata.name}] ${sonarrConnection.message}`);
      return;
    }

    const button = createSonarrButton(
      title,
      [...lookupTerms, title],
      new SonarrClient(sonarrConnection),
    );
    target.parentElement.insertBefore(button, target);
  } finally {
    mountInProgress = false;

    if (mountRequested) {
      requestMount();
    }
  }
}

function isPlexDetailRoute(): boolean {
  return location.href.includes("/details?key=");
}

function getSeriesTitle(): string | undefined {
  const title = document
    .querySelector<HTMLElement>('[data-testid="preplay-mainTitle"]')
    ?.innerText.trim();
  return title === undefined || title.length === 0 ? undefined : title;
}

function findActionTarget(): HTMLElement | undefined {
  const target = document.querySelector<HTMLElement>(
    '[aria-label="Share"], [title="Share"], [aria-label="More"], [title="More"]',
  );

  return target ?? undefined;
}

async function getShowLookupTerms(): Promise<readonly string[] | undefined> {
  if (plexClient === undefined) {
    return document.querySelector(televisionIndicatorSelector) === null ? undefined : [];
  }

  const metadataPath = getPlexMetadataPath();

  if (metadataPath === undefined) {
    return undefined;
  }

  try {
    const metadata = await plexClient.getMetadata(metadataPath);
    return metadata.mediaType === "show" ? metadata.sonarrLookupTerms : undefined;
  } catch (error) {
    console.warn(`[${metadata.name}] Unable to identify the Plex media type.`, error);
    return undefined;
  }
}

async function requestDetailSessionSecrets(): Promise<SettingsValues | undefined> {
  if (sessionCredentialsRequested) {
    return sessionSecrets;
  }

  const sonarrConnection = getSonarrConnectionConfig(settings, "session-api-key");
  const requiresPlexToken = (settings.plexServerUrl ?? "").trim().length > 0;
  const plexConfigCheck = getPlexConfig(settings, requiresPlexToken ? "session-token" : undefined);

  const configurationError =
    sonarrConnection instanceof Error
      ? sonarrConnection
      : plexConfigCheck instanceof Error
        ? plexConfigCheck
        : undefined;

  if (configurationError !== undefined) {
    console.warn(`[${metadata.name}] ${configurationError.message}`);
    return undefined;
  }

  sessionCredentialsRequested = true;
  sessionSecrets = await requestSessionSecrets("Plex Sonarr credentials", [
    ...sonarrSecretFields,
    ...(requiresPlexToken ? plexSecretFields : []),
  ]);
  plexConfiguration = getPlexConfig(settings, sessionSecrets?.plexToken);
  plexClient =
    plexConfiguration instanceof Error || plexConfiguration === undefined
      ? undefined
      : new PlexClient(plexConfiguration);
  return sessionSecrets;
}

function getPlexMetadataPath(): string | undefined {
  const detailUrl = new URL(location.href);
  const query =
    detailUrl.searchParams.size > 0
      ? detailUrl.searchParams
      : new URLSearchParams(detailUrl.hash.split("?")[1]);
  const key = query.get("key");

  if (key === null) {
    return undefined;
  }

  try {
    const path = decodeURIComponent(key);
    return /^\/library\/metadata\/\d+$/.test(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

function createSonarrButton(
  title: string,
  lookupTerms: readonly string[],
  sonarrClient: SonarrClient,
): HTMLButtonElement {
  const button = document.createElement("button");
  const icon = document.createElement("img");
  const label = document.createElement("span");

  button.id = buttonId;
  button.type = "button";
  button.title = "Look up this television show in Sonarr";
  button.style.alignItems = "center";
  button.style.background = "transparent";
  button.style.border = "none";
  button.style.color = "rgb(204, 204, 204)";
  button.style.cursor = "pointer";
  button.style.display = "flex";
  button.style.justifyContent = "center";
  button.style.marginRight = "8px";
  // Reserve room for the longest asynchronous status label so the surrounding
  // Plex actions do not shift horizontally while the lookup completes.
  button.style.minWidth = "148px";
  icon.alt = "";
  icon.height = 18;
  icon.src = serviceIconUrls.sonarr.light;
  icon.width = 18;
  icon.style.marginRight = "6px";
  label.textContent = "Sonarr";
  button.append(icon, label);

  button.addEventListener("mouseenter", () => {
    button.style.color = "white";
  });
  button.addEventListener("mouseleave", () => {
    if (!button.disabled) {
      button.style.color = "rgb(204, 204, 204)";
    }
  });
  button.addEventListener("click", () => {
    void openInSonarr(title, lookupTerms, sonarrClient, button, label);
  });

  return button;
}

async function openInSonarr(
  title: string,
  lookupTerms: readonly string[],
  sonarrClient: SonarrClient,
  button: HTMLButtonElement,
  label: HTMLSpanElement,
): Promise<void> {
  const sonarrWindow = window.open("about:blank", "_blank");

  if (sonarrWindow === null) {
    label.textContent = "Popup blocked";
    return;
  }

  sonarrWindow.opener = null;
  button.disabled = true;
  button.style.cursor = "wait";
  label.textContent = "Looking up…";

  try {
    const series = await findSeries(sonarrClient, lookupTerms);
    sonarrWindow.location.replace(sonarrClient.seriesUrl(series));
    label.textContent = "Open in Sonarr";
  } catch (error) {
    sonarrWindow.close();
    label.textContent = error instanceof SonarrNotFoundError ? "Not found" : "Sonarr error";
    console.warn(`[${metadata.name}] Could not look up "${title}" in Sonarr.`, error);
  } finally {
    button.disabled = false;
    button.style.cursor = "pointer";
  }
}

async function findSeries(
  sonarrClient: SonarrClient,
  lookupTerms: readonly string[],
): Promise<SonarrSeries> {
  for (const term of lookupTerms) {
    try {
      return await sonarrClient.findSeriesByLookupTerm(term);
    } catch (error) {
      if (!(error instanceof SonarrNotFoundError)) {
        throw error;
      }
    }
  }

  throw new SonarrNotFoundError();
}
