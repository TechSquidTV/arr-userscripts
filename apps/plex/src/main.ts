import {
  arrUserscriptsConfigurationGuideUrl,
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
import { getPlexMetadataPath, PlexClient } from "./plex.ts";

const buttonId = "arr-userscripts-plex-sonarr-button";
const televisionIndicatorSelector = [
  '[data-testid="preplay-seasonSelector"]',
  '[data-testid^="preplay-season"]',
  '[data-testid^="preplay-episode"]',
].join(", ");

let settings: SettingsValues;
let sessionSecrets: SettingsValues | undefined;
let plexClient: PlexClient | undefined;
let reconcileTimerId: number | undefined;

declare const ARR_USERSCRIPTS_PLEX_DEFAULTS: Readonly<Record<string, string>>;

void initialize();

async function initialize(): Promise<void> {
  settings = await initializeScriptSettings({
    defaults: ARR_USERSCRIPTS_PLEX_DEFAULTS,
    fields: [...sonarrConnectionSettingsFields, ...plexSettingsFields],
    menuCaption: "Configure Arr* Userscripts: Plex Sonarr",
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
  plexClient = undefined;
  observePlexPage();
}

function observePlexPage(): void {
  const observer = new MutationObserver(requestReconcile);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestReconcile();
}

function requestReconcile(): void {
  if (reconcileTimerId !== undefined) {
    return;
  }

  reconcileTimerId = window.setTimeout(() => {
    reconcileTimerId = undefined;
    reconcileButton();
  }, 50);
}

function reconcileButton(): void {
  const button = document.getElementById(buttonId);

  if (!isPlexDetailRoute() || !hasPlexTelevisionIndicators()) {
    button?.remove();
    return;
  }

  const title = getSeriesTitle();
  const target = findActionTarget();

  if (title === undefined || target?.parentElement === null || target === undefined) {
    button?.remove();
    return;
  }

  if (button !== null && button.dataset.plexRoute === location.href) {
    if (button.nextElementSibling !== target) {
      target.parentElement.insertBefore(button, target);
    }

    return;
  }

  button?.remove();

  const configurationError = getConfigurationError();
  const nextButton = createSonarrButton(title, configurationError);

  nextButton.dataset.plexRoute = location.href;
  target.parentElement.insertBefore(nextButton, target);
}

function isPlexDetailRoute(): boolean {
  return location.href.includes("/details?key=");
}

function hasPlexTelevisionIndicators(): boolean {
  return document.querySelector(televisionIndicatorSelector) !== null;
}

function getSeriesTitle(): string | undefined {
  const title = document
    .querySelector<HTMLElement>('[data-testid="preplay-mainTitle"]')
    ?.innerText.trim();
  return title === undefined || title.length === 0 ? undefined : title;
}

function findActionTarget(): HTMLElement | undefined {
  const target = document.querySelector<HTMLElement>(
    '[data-testid^="preplay-more"], [aria-label="More"], [title="More"], [aria-label="Share"], [title="Share"]',
  );

  return target ?? undefined;
}

function getConfigurationError(): Error | undefined {
  const sonarrConnection = getSonarrConnectionConfig(settings, "session-api-key");

  if (sonarrConnection instanceof Error) {
    return sonarrConnection;
  }

  const requiresPlexToken = (settings.plexServerUrl ?? "").trim().length > 0;
  const plexConfiguration = getPlexConfig(
    settings,
    requiresPlexToken ? "session-token" : undefined,
  );

  return plexConfiguration instanceof Error ? plexConfiguration : undefined;
}

async function getShowLookupTerms(): Promise<readonly string[] | undefined> {
  if (plexClient === undefined) {
    return hasPlexTelevisionIndicators() ? [] : undefined;
  }

  const metadataPath = getPlexMetadataPath(location.href);

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
  if (sessionSecrets !== undefined) {
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

  const requestedSecrets = await requestSessionSecrets("Plex Sonarr credentials", [
    ...sonarrSecretFields,
    ...(requiresPlexToken ? plexSecretFields : []),
  ]);

  if (requestedSecrets === undefined) {
    return undefined;
  }

  sessionSecrets = requestedSecrets;
  const plexConfiguration = getPlexConfig(settings, sessionSecrets.plexToken);
  plexClient =
    plexConfiguration instanceof Error || plexConfiguration === undefined
      ? undefined
      : new PlexClient(plexConfiguration);
  return sessionSecrets;
}

function createSonarrButton(
  title: string,
  configurationError: Error | undefined,
): HTMLButtonElement {
  const button = document.createElement("button");
  const icon = document.createElement("img");
  const label = document.createElement("span");

  button.id = buttonId;
  button.type = "button";
  button.title =
    configurationError === undefined
      ? "Look up this television show in Sonarr"
      : configurationError.message;
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
  label.textContent = configurationError === undefined ? "Sonarr" : "Configure Arr*";
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
    if (configurationError !== undefined) {
      window.open(arrUserscriptsConfigurationGuideUrl, "_blank", "noopener,noreferrer");
      return;
    }

    void openInSonarr(title, button, label);
  });

  return button;
}

async function openInSonarr(
  title: string,
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
    const secrets = await requestDetailSessionSecrets();

    if (secrets === undefined) {
      sonarrWindow.close();
      label.textContent = "Sonarr";
      return;
    }

    const lookupTerms = await getShowLookupTerms();

    if (lookupTerms === undefined) {
      sonarrWindow.close();
      label.textContent = "TV show required";
      return;
    }

    const sonarrConnection = getSonarrConnectionConfig(settings, secrets.sonarrApiKey);

    if (sonarrConnection instanceof Error) {
      throw sonarrConnection;
    }

    const sonarrClient = new SonarrClient(sonarrConnection);
    const series = await findSeries(sonarrClient, [...lookupTerms, title]);
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
