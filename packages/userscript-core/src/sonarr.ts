import { ArrApiClient, isArrJsonObject, type ArrJsonObject, type ArrJsonValue } from "./arr.ts";
import type { SonarrConfig, SonarrConnectionConfig } from "./sonarr-config.ts";

export interface SonarrSeries {
  readonly imdbId: string | undefined;
  readonly monitored: boolean;
  readonly titleSlug: string | undefined;
}

export class SonarrNotFoundError extends Error {
  public constructor() {
    super("Sonarr could not find this title.");
    this.name = "SonarrNotFoundError";
  }
}

export class SonarrClient extends ArrApiClient {
  public constructor(connection: SonarrConnectionConfig) {
    super(connection, () => new SonarrNotFoundError(), "/api/v3/series/lookup");
  }

  public async addSeries(imdbId: string, config: SonarrConfig): Promise<SonarrSeries> {
    const seriesToAdd = await this.lookupEntry(`imdb:${imdbId}`);
    const configuredSeries: ArrJsonObject = {
      ...seriesToAdd,
      ...(config.languageProfileId === undefined
        ? {}
        : { languageProfileId: config.languageProfileId }),
      addOptions: {
        searchForMissingEpisodes: config.searchForMissingEpisodes,
      },
      monitored: config.monitored,
      qualityProfileId: config.qualityProfileId,
      rootFolderPath: config.rootFolderPath,
    };

    return parseSonarrSeries(
      await this.requestJson("/api/v3/series", {
        body: JSON.stringify(configuredSeries),
        method: "POST",
      }),
    );
  }

  public async findExistingSeries(imdbId: string): Promise<SonarrSeries | undefined> {
    const library = await this.requestJson("/api/v3/series");

    if (!Array.isArray(library)) {
      throw new Error("Sonarr returned an invalid series library.");
    }

    return library.map(parseSonarrSeries).find((series) => series.imdbId === imdbId);
  }

  public async findSeriesByLookupTerm(term: string): Promise<SonarrSeries> {
    return parseSonarrSeries(await this.lookupEntry(term));
  }

  public seriesUrl(series: SonarrSeries): string {
    if (series.titleSlug === undefined) {
      throw new Error("Sonarr did not provide a series URL.");
    }

    return `${this.connection.url}/series/${encodeURIComponent(series.titleSlug)}`;
  }
}

function parseSonarrSeries(value: ArrJsonValue): SonarrSeries {
  if (!isArrJsonObject(value)) {
    throw new Error("Sonarr returned an invalid series.");
  }

  const imdbId = value.imdbId;
  const monitored = value.monitored;
  const titleSlug = value.titleSlug;

  if (
    (imdbId !== undefined && typeof imdbId !== "string") ||
    typeof monitored !== "boolean" ||
    (titleSlug !== undefined && typeof titleSlug !== "string")
  ) {
    throw new Error("Sonarr returned an invalid series.");
  }

  return { imdbId, monitored, titleSlug };
}
