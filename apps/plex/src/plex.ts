import { gmXmlHttpRequest } from "@arr-userscripts/core";
import type { PlexConfig } from "./config.ts";

export type PlexMediaType = "album" | "artist" | "movie" | "show" | "track" | "unknown";

export interface PlexMetadata {
  readonly mediaType: PlexMediaType;
  readonly sonarrLookupTerms: readonly string[];
}

export class PlexClient {
  private readonly metadataRequests = new Map<string, Promise<PlexMetadata>>();

  public constructor(private readonly config: PlexConfig) {}

  public async getMetadata(metadataPath: string): Promise<PlexMetadata> {
    const cachedRequest = this.metadataRequests.get(metadataPath);

    if (cachedRequest !== undefined) {
      return cachedRequest;
    }

    const request = this.requestMetadata(metadataPath);
    this.metadataRequests.set(metadataPath, request);
    void request.catch(() => {
      this.metadataRequests.delete(metadataPath);
    });

    return request;
  }

  private async requestMetadata(metadataPath: string): Promise<PlexMetadata> {
    const response = await gmXmlHttpRequest({
      headers: {
        Accept: "application/xml",
        "X-Plex-Token": this.config.token,
      },
      method: "GET",
      responseType: "text",
      timeout: 15_000,
      url: `${this.config.url}${metadataPath}`,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Plex returned ${response.status} ${response.statusText}.`.trim());
    }

    return parseMetadata(response.responseText);
  }
}

function parseMetadata(xml: string): PlexMetadata {
  const document = new DOMParser().parseFromString(xml, "application/xml");

  if (document.querySelector("parsererror") !== null) {
    throw new Error("Plex returned invalid XML.");
  }

  const mediaType = parseMediaType(
    document.querySelector("Video, Directory")?.getAttribute("type"),
  );
  const sonarrLookupTerms = parseSonarrLookupTerms(document);

  return { mediaType, sonarrLookupTerms };
}

function parseMediaType(type: string | null | undefined): PlexMediaType {
  switch (type) {
    case "album":
    case "artist":
    case "movie":
    case "show":
    case "track":
      return type;
    default:
      return "unknown";
  }
}

function parseSonarrLookupTerms(document: Document): readonly string[] {
  const identifiersByProvider = new Map<string, string>();

  for (const guid of document.querySelectorAll("Guid")) {
    const identifier = parseExternalIdentifier(guid.getAttribute("id"));

    if (identifier !== undefined && !identifiersByProvider.has(identifier.provider)) {
      identifiersByProvider.set(identifier.provider, identifier.value);
    }
  }

  return ["imdb", "tvdb", "tmdb"].flatMap((provider) => {
    const value = identifiersByProvider.get(provider);
    return value === undefined ? [] : [`${provider}:${value}`];
  });
}

function parseExternalIdentifier(
  value: string | null,
): { readonly provider: string; readonly value: string } | undefined {
  if (value === null) {
    return undefined;
  }

  const match = /^(imdb|tmdb|tvdb):\/\/([^/]+)$/.exec(value);

  if (match === null) {
    return undefined;
  }

  const provider = match[1];
  const identifier = match[2];

  if (provider === undefined || identifier === undefined || identifier.length === 0) {
    return undefined;
  }

  return { provider, value: identifier };
}
