import {
  optionalEnvironmentValue,
  parseBoolean,
  parsePositiveInteger,
  requireEnvironmentValue,
} from "./environment.ts";
import { getArrConnectionConfig, loadArrServerOptions, type ArrConnectionConfig } from "./arr.ts";
import type { ServerOptionsLoader, SettingsField, SettingsValues } from "./settings.ts";

export interface SonarrConnectionConfig extends ArrConnectionConfig {}

export interface SonarrConfig extends SonarrConnectionConfig {
  readonly languageProfileId?: number;
  readonly monitored: boolean;
  readonly qualityProfileId: number;
  readonly rootFolderPath: string;
  readonly searchForMissingEpisodes: boolean;
}

export const sonarrConnectionSettingsFields: readonly SettingsField[] = [
  {
    hint: "Stored locally by your userscript manager and used for Sonarr requests.",
    key: "sonarrApiKey",
    label: "Sonarr API key",
    type: "password",
  },
  {
    hint: "The address you use to open Sonarr, including https://.",
    key: "sonarrUrl",
    label: "Sonarr URL",
    type: "text",
  },
];

export const sonarrServerOptionsLoader: ServerOptionsLoader = {
  buttonLabel: "Reload Sonarr folders and profiles",
  insertAfterFieldKey: "sonarrUrl",
  isReady: (values) =>
    (values.sonarrApiKey ?? "").trim().length > 0 && (values.sonarrUrl ?? "").trim().length > 0,
  load: async (values) => {
    const connection = getSonarrConnectionConfig(values);

    if (connection instanceof Error) {
      throw connection;
    }

    const options = await loadArrServerOptions(connection);
    return {
      sonarrQualityProfileId: options.qualityProfiles,
      sonarrRootFolder: options.rootFolders,
    };
  },
};

export const sonarrSettingsFields: readonly SettingsField[] = [
  ...sonarrConnectionSettingsFields,
  {
    hint: "The folder path Sonarr should use for this series.",
    key: "sonarrRootFolder",
    label: "Sonarr root folder",
    type: "text",
  },
  {
    hint: "A positive numeric ID from Sonarr’s quality profiles.",
    key: "sonarrQualityProfileId",
    label: "Sonarr quality profile ID",
    type: "text",
  },
  {
    hint: "Leave empty if your Sonarr version does not use language profiles.",
    key: "sonarrLanguageProfileId",
    label: "Sonarr language profile ID (optional)",
    type: "text",
  },
  { key: "sonarrMonitored", label: "Monitor series", type: "checkbox" },
  { key: "sonarrSearchForMissingEpisodes", label: "Search for missing episodes", type: "checkbox" },
];

export function getSonarrConnectionConfig(
  settings: SettingsValues,
): SonarrConnectionConfig | Error {
  return getArrConnectionConfig({
    apiKeyValue: settings.sonarrApiKey,
    apiKeyVariable: "Sonarr API key",
    serviceName: "Sonarr",
    urlValue: settings.sonarrUrl,
    urlVariable: "Sonarr URL",
  });
}

export function getSonarrConfig(settings: SettingsValues): SonarrConfig | Error {
  const connectionConfig = getSonarrConnectionConfig(settings);

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
