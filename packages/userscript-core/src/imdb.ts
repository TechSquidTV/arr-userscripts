import { waitForElement } from "./dom.ts";

export type ImdbTitleKind = "movie" | "series" | "unknown";

export interface ImdbArrClient<Config, Item extends ImdbArrItem> {
  add(imdbId: string, config: Config): Promise<Item>;
  findExisting(imdbId: string): Promise<Item | undefined>;
}

export interface ImdbArrIntegration<Config, Item extends ImdbArrItem> {
  readonly buttonId: string;
  readonly createClient: (config: Config) => ImdbArrClient<Config, Item>;
  readonly getConfig: () => Promise<Config | Error>;
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

export async function mountImdbArrIntegration<Config, Item extends ImdbArrItem>(
  integration: ImdbArrIntegration<Config, Item>,
): Promise<void> {
  const imdbId = getImdbTitleId(window.location.pathname);

  if (imdbId === undefined || document.getElementById(integration.buttonId) !== null) {
    return;
  }

  const actionAnchor = await waitForElement<HTMLElement>(
    '[data-testid^="watched-button-tt"], [data-testid="hero__pageTitle"]',
    {
      timeoutMs: 30_000,
    },
  ).catch((error: Error) => {
    console.warn(`[${integration.scriptName}] ${error.message}`);
    return undefined;
  });

  if (
    actionAnchor === undefined ||
    actionAnchor.parentElement === null ||
    getImdbTitleKind(document) !== integration.mediaKind
  ) {
    return;
  }

  const button = createImdbArrButton(integration.serviceName, integration.iconUrl);
  button.element.id = integration.buttonId;
  actionAnchor.parentElement.insertBefore(button.element, actionAnchor);

  const config = await integration.getConfig();

  if (config instanceof Error) {
    button.setStatus(`Configure ${integration.serviceName}`, "error");
    button.element.disabled = true;
    button.element.style.cursor = "default";
    button.element.title = config.message;
    return;
  }

  const client = integration.createClient(config);
  await updateExistingStatus(integration, client, imdbId, button);

  button.element.addEventListener("click", () => {
    void addToArr(integration, client, config, imdbId, button);
  });
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
): Promise<void> {
  try {
    const existingItem = await client.findExisting(imdbId);

    if (existingItem !== undefined) {
      button.setStatus(
        existingItem.monitored
          ? `Monitored in ${integration.serviceName} ✓`
          : `In ${integration.serviceName} (unmonitored) ✓`,
        "success",
      );
    }
  } catch (error) {
    console.warn(`[${integration.scriptName}] Could not read the library.`, error);
  }
}

async function addToArr<Config, Item extends ImdbArrItem>(
  integration: ImdbArrIntegration<Config, Item>,
  client: ImdbArrClient<Config, Item>,
  config: Config,
  imdbId: string,
  button: ImdbArrButton,
): Promise<void> {
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
