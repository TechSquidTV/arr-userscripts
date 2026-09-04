export type ImdbTitleKind = "movie" | "series" | "unknown";

export interface ImdbArrClient<Config, Item extends ImdbArrItem> {
  add(imdbId: string, config: Config): Promise<Item>;
  findExisting(imdbId: string): Promise<Item | undefined>;
}

export interface ImdbArrIntegration<Config, Item extends ImdbArrItem> {
  readonly buttonId: string;
  readonly createClient: (config: Config) => ImdbArrClient<Config, Item>;
  readonly getConfig: () => Config | Error;
  readonly getSessionConfig: () => Promise<Config | Error>;
  readonly iconUrl: string;
  readonly isNotFoundError: (error: Error) => boolean;
  readonly mediaKind: Exclude<ImdbTitleKind, "unknown">;
  readonly scriptName: string;
  readonly serviceName: string;
}

export interface ImdbArrItem {
  readonly monitored: boolean;
}

type JsonLdPrimitive = boolean | null | number | string;
type JsonLdValue = JsonLdArray | JsonLdObject | JsonLdPrimitive;

interface JsonLdArray extends ReadonlyArray<JsonLdValue> {}

interface JsonLdObject {
  readonly [key: string]: JsonLdValue;
}

type ImdbArrButtonState = "default" | "error" | "loading" | "success";

interface ImdbArrButton {
  readonly element: HTMLButtonElement;
  setStatus(label: string, state: ImdbArrButtonState): void;
}

const imdbPrimaryActionSelector =
  '[data-testid="tm-box-wl-button"], [data-testid^="watched-button-tt"]';
const imdbFallbackDelayMs = 5_000;
const imdbReconcileDelayMs = 50;
const configurationGuideUrl =
  "https://github.com/techsquidtv/arr-userscripts#install-in-three-steps";

export interface ImdbTitleSignals {
  readonly hasEpisodeGuide: boolean;
  readonly hasMoviePopularityLink: boolean;
  readonly jsonLd: readonly string[];
  readonly openGraphType?: string;
}

export function classifyImdbJsonLd(value: string): ImdbTitleKind {
  let parsedValue: JsonLdValue;

  try {
    parsedValue = JSON.parse(value) as JsonLdValue;
  } catch {
    return "unknown";
  }

  const titleKinds = new Set<Exclude<ImdbTitleKind, "unknown">>();
  collectTitleKinds(parsedValue, titleKinds);

  return titleKinds.size === 1 ? ([...titleKinds][0] ?? "unknown") : "unknown";
}

export function getImdbTitleId(pathname: string): string | undefined {
  return pathname.match(/\/title\/(tt\d+)/)?.[1];
}

export function getImdbTitleKind(document: Document): ImdbTitleKind {
  const openGraphType = document.querySelector('meta[property="og:type"]')?.getAttribute("content");

  return classifyImdbTitleSignals({
    hasEpisodeGuide:
      document.querySelector('[data-testid="hero-subnav-bar-series-episode-guide-link"]') !== null,
    hasMoviePopularityLink: document.querySelector('a[href^="/chart/moviemeter/"]') !== null,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => script.textContent ?? "",
    ),
    ...(openGraphType === null || openGraphType === undefined ? {} : { openGraphType }),
  });
}

function findImdbActionContainer(allowTitleFallback: boolean): HTMLElement | undefined {
  const actionAnchor = document.querySelector<HTMLElement>(imdbPrimaryActionSelector);

  if (actionAnchor !== null) {
    if (actionAnchor.matches('[data-testid="tm-box-wl-button"]')) {
      const actionContainer = actionAnchor.parentElement?.parentElement;

      if (actionContainer instanceof HTMLElement) {
        return actionContainer;
      }
    }

    return actionAnchor;
  }

  if (allowTitleFallback) {
    const title = document.querySelector<HTMLElement>('[data-testid="hero__pageTitle"]');

    return title ?? undefined;
  }

  return undefined;
}

export function classifyImdbTitleSignals(signals: ImdbTitleSignals): ImdbTitleKind {
  const titleKinds = new Set<Exclude<ImdbTitleKind, "unknown">>();

  for (const jsonLd of signals.jsonLd) {
    const kind = classifyImdbJsonLd(jsonLd);

    if (kind !== "unknown") {
      titleKinds.add(kind);
    }
  }

  if (titleKinds.size === 1) {
    return [...titleKinds][0] ?? "unknown";
  }

  if (signals.hasEpisodeGuide || signals.openGraphType === "video.tv_show") {
    return "series";
  }

  if (signals.hasMoviePopularityLink || signals.openGraphType === "video.movie") {
    return "movie";
  }

  return "unknown";
}

export function mountImdbArrIntegration<Config, Item extends ImdbArrItem>(
  integration: ImdbArrIntegration<Config, Item>,
): void {
  let fallbackTimerId: number | undefined;
  let lastImdbId: string | undefined;
  let reconcileTimerId: number | undefined;

  const scheduleReconcile = (): void => {
    if (reconcileTimerId !== undefined) {
      return;
    }

    reconcileTimerId = window.setTimeout(() => {
      reconcileTimerId = undefined;
      reconcile();
    }, imdbReconcileDelayMs);
  };

  const reconcile = (): void => {
    const imdbId = getImdbTitleId(window.location.pathname);
    const existingButton = document.getElementById(integration.buttonId);

    if (imdbId !== lastImdbId) {
      lastImdbId = imdbId;

      if (fallbackTimerId !== undefined) {
        window.clearTimeout(fallbackTimerId);
      }

      fallbackTimerId = window.setTimeout(() => {
        fallbackTimerId = undefined;
        scheduleReconcile();
      }, imdbFallbackDelayMs);
    }

    if (imdbId === undefined || getImdbTitleKind(document) !== integration.mediaKind) {
      existingButton?.remove();
      return;
    }

    if (existingButton !== null) {
      if (existingButton.dataset.imdbTitleId === imdbId) {
        return;
      }

      existingButton.remove();
    }

    const actionContainer = findImdbActionContainer(fallbackTimerId === undefined);

    if (actionContainer === undefined) {
      return;
    }

    const button = createImdbArrButton(integration.serviceName, integration.iconUrl);
    button.element.dataset.imdbTitleId = imdbId;
    button.element.id = integration.buttonId;
    actionContainer.insertAdjacentElement("afterend", button.element);

    const config = integration.getConfig();

    if (config instanceof Error) {
      button.setStatus(`Configure ${integration.serviceName}`, "default");
      button.element.title = config.message;
      button.element.addEventListener("click", () => {
        window.open(configurationGuideUrl, "_blank", "noopener,noreferrer");
      });
      return;
    }

    button.element.addEventListener("click", () => {
      void addToArr(integration, imdbId, button);
    });
  };

  const observer = new MutationObserver(scheduleReconcile);

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleReconcile();
}

function collectTitleKinds(
  value: JsonLdValue,
  titleKinds: Set<Exclude<ImdbTitleKind, "unknown">>,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTitleKinds(entry, titleKinds);
    }

    return;
  }

  if (!isJsonLdObject(value)) {
    return;
  }

  addTitleKind(value["@type"], titleKinds);
  const graph = value["@graph"];

  if (graph !== undefined) {
    collectTitleKinds(graph, titleKinds);
  }
}

function addTitleKind(
  value: JsonLdValue | undefined,
  titleKinds: Set<Exclude<ImdbTitleKind, "unknown">>,
): void {
  const types = Array.isArray(value) ? value : [value];

  for (const type of types) {
    if (type === "Movie") {
      titleKinds.add("movie");
    }

    if (type === "TVSeries") {
      titleKinds.add("series");
    }
  }
}

function isJsonLdObject(value: JsonLdValue): value is JsonLdObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createImdbArrButton(serviceName: string, iconUrl: string): ImdbArrButton {
  const element = document.createElement("button");
  const icon = document.createElement("img");
  const label = document.createElement("span");

  element.type = "button";
  element.className =
    "ipc-btn ipc-btn--full-width ipc-btn--left-align-content ipc-btn--large-height ipc-btn--core-baseAlt ipc-btn--theme-baseAlt ipc-btn--button-radius ipc-btn--on-accent2 ipc-secondary-button";
  element.style.marginBlock = "8px";
  icon.alt = "";
  icon.height = 20;
  icon.src = iconUrl;
  icon.width = 20;
  icon.style.marginRight = "8px";
  label.className = "ipc-btn__text";
  element.append(icon, label);

  const setStatus = (nextLabel: string, state: ImdbArrButtonState): void => {
    label.textContent = nextLabel;
    element.disabled = state === "loading" || state === "success";
    element.style.backgroundColor = buttonColorByState[state];
    element.style.cursor = element.disabled ? "default" : "pointer";
  };

  setStatus(`Add to ${serviceName}`, "default");
  return { element, setStatus };
}

async function updateExistingStatus<Config, Item extends ImdbArrItem>(
  integration: ImdbArrIntegration<Config, Item>,
  client: ImdbArrClient<Config, Item>,
  imdbId: string,
  button: ImdbArrButton,
): Promise<boolean> {
  try {
    const existingItem = await client.findExisting(imdbId);

    if (existingItem !== undefined) {
      button.setStatus(
        existingItem.monitored
          ? `Monitored in ${integration.serviceName} ✓`
          : `In ${integration.serviceName} (unmonitored) ✓`,
        "success",
      );
      return true;
    }
  } catch (error) {
    console.warn(`[${integration.scriptName}] Could not read the library.`, error);
  }

  return false;
}

async function addToArr<Config, Item extends ImdbArrItem>(
  integration: ImdbArrIntegration<Config, Item>,
  imdbId: string,
  button: ImdbArrButton,
): Promise<void> {
  button.setStatus("Connecting…", "loading");

  const config = await integration.getSessionConfig();

  if (config instanceof Error) {
    button.setStatus(config.message, "error");
    return;
  }

  const client = integration.createClient(config);

  if (await updateExistingStatus(integration, client, imdbId, button)) {
    return;
  }

  button.setStatus("Looking up…", "loading");

  try {
    const item = await client.add(imdbId, config);
    button.setStatus(
      item.monitored
        ? `Monitored in ${integration.serviceName} ✓`
        : `In ${integration.serviceName} (unmonitored) ✓`,
      "success",
    );
  } catch (error) {
    if (error instanceof Error && integration.isNotFoundError(error)) {
      button.setStatus(`Not found in ${integration.serviceName}`, "error");
      return;
    }

    button.setStatus(
      error instanceof Error ? error.message : `Unable to add to ${integration.serviceName}`,
      "error",
    );
  }
}

const buttonColorByState: Record<ImdbArrButtonState, string> = {
  default: "#0084ff",
  error: "#dc2626",
  loading: "#0084ff",
  success: "#16a34a",
};
