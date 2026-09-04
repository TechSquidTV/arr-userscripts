import { getArrConnectionConfig, type ArrConnectionConfig } from "./arr.ts";
import { parseBoolean, parsePositiveInteger, requireEnvironmentValue } from "./environment.ts";
import type { SettingsField, SettingsValues } from "./settings.ts";

export interface RadarrConnectionConfig extends ArrConnectionConfig {}

export interface RadarrConfig extends RadarrConnectionConfig {
  readonly monitored: boolean;
  readonly qualityProfileId: number;
  readonly rootFolderPath: string;
  readonly searchForMovie: boolean;
}

export const radarrSettingsFields: readonly SettingsField[] = [
  { key: "radarrUrl", label: "Radarr URL", type: "text" },
  { key: "radarrRootFolder", label: "Radarr root folder", type: "text" },
  { key: "radarrQualityProfileId", label: "Radarr quality profile ID", type: "text" },
  { key: "radarrMonitored", label: "Monitor movie", type: "checkbox" },
  { key: "radarrSearchForMovie", label: "Search for movie", type: "checkbox" },
];

export const radarrSecretFields = [{ key: "radarrApiKey", label: "Radarr API key" }] as const;

export function getRadarrConnectionConfig(
  settings: SettingsValues,
  apiKey: string | undefined,
): RadarrConnectionConfig | Error {
  return getArrConnectionConfig({
    apiKeyValue: apiKey,
    apiKeyVariable: "Radarr API key",
    serviceName: "Radarr",
    urlValue: settings.radarrUrl,
    urlVariable: "Radarr URL",
  });
}

export function getRadarrConfig(
  settings: SettingsValues,
  apiKey: string | undefined,
): RadarrConfig | Error {
  const connectionConfig = getRadarrConnectionConfig(settings, apiKey);

  if (connectionConfig instanceof Error) {
    return connectionConfig;
  }

  try {
    return {
      ...connectionConfig,
      monitored: parseBoolean(settings.radarrMonitored, "radarrMonitored", true),
      qualityProfileId: parsePositiveInteger(
        settings.radarrQualityProfileId,
        "radarrQualityProfileId",
      ),
      rootFolderPath: requireEnvironmentValue(settings.radarrRootFolder, "radarrRootFolder"),
      searchForMovie: parseBoolean(settings.radarrSearchForMovie, "radarrSearchForMovie", true),
    };
  } catch (error) {
    return error instanceof Error ? error : new Error("Unable to read Radarr configuration.");
  }
}
