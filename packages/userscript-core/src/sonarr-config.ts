import {
  optionalEnvironmentValue,
  parseBoolean,
  parsePositiveInteger,
  requireEnvironmentValue,
} from "./environment.ts";
import { getArrConnectionConfig, type ArrConnectionConfig } from "./arr.ts";
import type { SettingsField, SettingsValues } from "./settings.ts";

export interface SonarrConnectionConfig extends ArrConnectionConfig {}

export interface SonarrConfig extends SonarrConnectionConfig {
  readonly languageProfileId?: number;
  readonly monitored: boolean;
  readonly qualityProfileId: number;
  readonly rootFolderPath: string;
  readonly searchForMissingEpisodes: boolean;
}

export const sonarrConnectionSettingsFields: readonly SettingsField[] = [
  { key: "sonarrUrl", label: "Sonarr URL", type: "text" },
];

export const sonarrSecretFields = [{ key: "sonarrApiKey", label: "Sonarr API key" }] as const;

export const sonarrSettingsFields: readonly SettingsField[] = [
  ...sonarrConnectionSettingsFields,
  { key: "sonarrRootFolder", label: "Sonarr root folder", type: "text" },
  { key: "sonarrQualityProfileId", label: "Sonarr quality profile ID", type: "text" },
  { key: "sonarrLanguageProfileId", label: "Sonarr language profile ID (optional)", type: "text" },
  { key: "sonarrMonitored", label: "Monitor series", type: "checkbox" },
  { key: "sonarrSearchForMissingEpisodes", label: "Search for missing episodes", type: "checkbox" },
];

export function getSonarrConnectionConfig(
  settings: SettingsValues,
  apiKey: string | undefined,
): SonarrConnectionConfig | Error {
  return getArrConnectionConfig({
    apiKeyValue: apiKey,
    apiKeyVariable: "Sonarr API key",
    serviceName: "Sonarr",
    urlValue: settings.sonarrUrl,
    urlVariable: "Sonarr URL",
  });
}

export function getSonarrConfig(
  settings: SettingsValues,
  apiKey: string | undefined,
): SonarrConfig | Error {
  const connectionConfig = getSonarrConnectionConfig(settings, apiKey);

  if (connectionConfig instanceof Error) {
    return connectionConfig;
  }

  try {
    const languageProfileId = optionalEnvironmentValue(settings.sonarrLanguageProfileId);

    return {
      ...connectionConfig,
      ...(languageProfileId === undefined
        ? {}
        : {
            languageProfileId: parsePositiveInteger(languageProfileId, "sonarrLanguageProfileId"),
          }),
      monitored: parseBoolean(settings.sonarrMonitored, "sonarrMonitored", true),
      qualityProfileId: parsePositiveInteger(
        settings.sonarrQualityProfileId,
        "sonarrQualityProfileId",
      ),
      rootFolderPath: requireEnvironmentValue(settings.sonarrRootFolder, "sonarrRootFolder"),
      searchForMissingEpisodes: parseBoolean(
        settings.sonarrSearchForMissingEpisodes,
        "sonarrSearchForMissingEpisodes",
        true,
      ),
    };
  } catch (error) {
    return error instanceof Error ? error : new Error("Unable to read Sonarr configuration.");
  }
}
