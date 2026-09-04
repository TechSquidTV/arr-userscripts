import { ArrApiClient, isArrJsonObject, type ArrJsonObject, type ArrJsonValue } from "./arr.ts";
import type { RadarrConfig, RadarrConnectionConfig } from "./radarr-config.ts";

export interface RadarrMovie {
  readonly imdbId: string | undefined;
  readonly monitored: boolean;
}

export class RadarrNotFoundError extends Error {
  public constructor() {
    super("Radarr could not find this title.");
    this.name = "RadarrNotFoundError";
  }
}

export class RadarrClient extends ArrApiClient {
  public constructor(connection: RadarrConnectionConfig) {
    super(connection, () => new RadarrNotFoundError(), "/api/v3/movie/lookup");
  }

  public async addMovie(imdbId: string, config: RadarrConfig): Promise<RadarrMovie> {
    const movieToAdd = await this.lookupEntry(`imdb:${imdbId}`);
    const configuredMovie: ArrJsonObject = {
      ...movieToAdd,
      addOptions: {
        searchForMovie: config.searchForMovie,
      },
      monitored: config.monitored,
      qualityProfileId: config.qualityProfileId,
      rootFolderPath: config.rootFolderPath,
    };

    return parseRadarrMovie(
      await this.requestJson("/api/v3/movie", {
        body: JSON.stringify(configuredMovie),
        method: "POST",
      }),
    );
  }

  public async findExistingMovie(imdbId: string): Promise<RadarrMovie | undefined> {
    const library = await this.requestJson("/api/v3/movie");

    if (!Array.isArray(library)) {
      throw new Error("Radarr returned an invalid movie library.");
    }

    return library.map(parseRadarrMovie).find((movie) => movie.imdbId === imdbId);
  }
}

function parseRadarrMovie(value: ArrJsonValue): RadarrMovie {
  if (!isArrJsonObject(value)) {
    throw new Error("Radarr returned an invalid movie.");
  }

  const imdbId = value.imdbId;
  const monitored = value.monitored;

  if ((imdbId !== undefined && typeof imdbId !== "string") || typeof monitored !== "boolean") {
    throw new Error("Radarr returned an invalid movie.");
  }

  return { imdbId, monitored };
}
