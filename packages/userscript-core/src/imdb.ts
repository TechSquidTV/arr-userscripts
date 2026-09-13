import { arrUserscriptsConfigurationGuideUrl } from "./documentation.ts";
import { createImdbArrButton, type ImdbArrButton } from "./imdb-button.ts";

export type ImdbTitleKind = "movie" | "series" | "unknown";

export interface ImdbArrClient<Config, Item extends ImdbArrItem> {
  add(imdbId: string, config: Config): Promise<Item>;
  findExisting(imdbId: string): Promise<Item | undefined>;
  getUrl(imdbId: string, item?: Item): string;
}

export interface ImdbArrIntegration<Config, Item extends ImdbArrItem> {
  readonly buttonId: string;
  readonly createClient: (config: Config) => ImdbArrClient<Config, Item>;
  readonly getConfig: () => Config | Error;
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

const imdbLegacyActionSelector = '[data-testid^="watched-button-tt"]';
const imdbWatchlistSelector = '[data-testid="tm-box-wl-button"]';
const imdbFallbackDelayMs = 5_000;
const imdbReconcileDelayMs = 50;

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
  const watchlistButton = document.querySelector<HTMLElement>(imdbWatchlistSelector);

  if (watchlistButton !== null) {
    const actionContainer = watchlistButton.parentElement?.parentElement;

    if (actionContainer instanceof HTMLElement) {
      return actionContainer;
    }
  }

  const legacyAction = document.querySelector<HTMLElement>(imdbLegacyActionSelector);

  if (legacyAction !== null) {
    return legacyAction;
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
  let mountedButton: ImdbArrButton | undefined;
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
    if (imdbId !== lastImdbId) {
      lastImdbId = imdbId;
      mountedButton?.remove();
      mountedButton = undefined;

      if (fallbackTimerId !== undefined) {
        window.clearTimeout(fallbackTimerId);
      }

      fallbackTimerId = window.setTimeout(() => {
        fallbackTimerId = undefined;
        scheduleReconcile();
      }, imdbFallbackDelayMs);
    }

    if (imdbId === undefined || getImdbTitleKind(document) !== integration.mediaKind) {
      mountedButton?.remove();
      mountedButton = undefined;
      return;
    }

    const actionContainer = findImdbActionContainer(fallbackTimerId === undefined);

    if (mountedButton !== undefined) {
      if (
        actionContainer !== undefined &&
        mountedButton.container.previousElementSibling !== actionContainer
      ) {
        actionContainer.insertAdjacentElement("afterend", mountedButton.container);
      }

      return;
    }

    if (actionContainer === undefined) {
      return;
    }

    const button = createImdbArrButton(
      integration.buttonId,
      integration.serviceName,
      integration.iconUrl,
    );
    mountedButton = button;
    button.element.dataset.imdbTitleId = imdbId;
    actionContainer.insertAdjacentElement("afterend", button.container);

    const config = integration.getConfig();

    if (config instanceof Error) {
      button.setStatus(`Configure ${integration.serviceName}`, "default");
      button.element.title = config.message;
      button.element.addEventListener("click", () => {
        window.open(arrUserscriptsConfigurationGuideUrl, "_blank", "noopener,noreferrer");
      });
      return;
    }

    bindImdbArrActions(integration, config, imdbId, button);
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

function bindImdbArrActions<Config, Item extends ImdbArrItem>(
  integration: ImdbArrIntegration<Config, Item>,
  config: Config,
  imdbId: string,
  button: ImdbArrButton,
): void {
  const client = integration.createClient(config);
  let busy = false;
  let canAdd = false;

  const update = async (shouldAdd: boolean): Promise<void> => {
    if (busy) {
      return;
    }

    busy = true;
    canAdd = false;
    let adding = false;
    button.setStatus(`Checking ${integration.serviceName}…`, "loading");
    console.info(`[${integration.scriptName}] Checking library for ${imdbId}.`);

    try {
      let item = await client.findExisting(imdbId);
      console.info(
        `[${integration.scriptName}] ${imdbId}: ${item === undefined ? "not in library" : item.monitored ? "monitored" : "in library, unmonitored"}.`,
      );

      if (item === undefined && shouldAdd) {
        adding = true;
        button.setStatus(`Adding to ${integration.serviceName}…`, "loading");
        item = await client.add(imdbId, config);
        console.info(`[${integration.scriptName}] Added ${imdbId}.`);
      }

      button.setUrl(client.getUrl(imdbId, item));
      canAdd = item === undefined;
      button.setStatus(
        item === undefined
          ? `Add to ${integration.serviceName}`
          : item.monitored
            ? `Monitored in ${integration.serviceName}`
            : `In ${integration.serviceName} (unmonitored)`,
        item === undefined ? "default" : "success",
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The request failed.";
      console.warn(
        `[${integration.scriptName}] Could not ${adding ? "add title" : "read library"} for ${imdbId}.`,
        error,
      );
      button.setStatus(
        adding
          ? error instanceof Error && integration.isNotFoundError(error)
            ? `Not found in ${integration.serviceName}`
            : `Unable to add to ${integration.serviceName}`
          : `Retry ${integration.serviceName} check`,
        "error",
        detail,
      );
    } finally {
      busy = false;
    }
  };

  button.element.addEventListener("click", (event) => {
    // Reads run on mount; privileged mutations still require a real user click.
    if (event.isTrusted && !button.element.disabled) {
      void update(canAdd);
    }
  });
  button.refresh.addEventListener("click", (event) => {
    if (event.isTrusted && !button.refresh.disabled) {
      void update(false);
    }
  });
  button.setUrl(client.getUrl(imdbId));
  void update(false);
}
