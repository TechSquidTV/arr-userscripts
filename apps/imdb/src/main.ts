import {
  getSonarrConfig,
  initializeScriptSettings,
  mountImdbArrIntegration,
  requestSessionSecrets,
  serviceIconUrls,
  sonarrSecretFields,
  sonarrServerOptionsLoader,
  sonarrSettingsFields,
  SonarrClient,
  SonarrNotFoundError,
} from "@arr-userscripts/core";
import { metadata } from "./metadata.ts";

declare const ARR_USERSCRIPTS_IMDB_DEFAULTS: Readonly<Record<string, string>>;

void initialize();

async function initialize(): Promise<void> {
  const settings = await initializeScriptSettings({
    defaults: ARR_USERSCRIPTS_IMDB_DEFAULTS,
    fields: sonarrSettingsFields,
    menuCaption: "Configure ARR Userscripts: IMDb Sonarr",
    serverOptionsLoader: sonarrServerOptionsLoader,
    storageKey: "arr-userscripts/imdb-sonarr/settings-v1",
    validate: (values) => {
      const config = getSonarrConfig(values, "session-api-key");
      return config instanceof Error ? config : undefined;
    },
  });
  await mountImdbArrIntegration({
    buttonId: "arr-userscripts-sonarr-button",
    createClient: (config) => {
      const client = new SonarrClient(config);

      return {
        add: (imdbId, currentConfig) => client.addSeries(imdbId, currentConfig),
        findExisting: (imdbId) => client.findExistingSeries(imdbId),
      };
    },
    getConfig: async () => {
      const configuration = getSonarrConfig(settings, "session-api-key");

      if (configuration instanceof Error) {
        return configuration;
      }

      const sessionSecrets = await requestSessionSecrets(
        "IMDb Sonarr credentials",
        sonarrSecretFields,
      );
      return getSonarrConfig(settings, sessionSecrets?.sonarrApiKey);
    },
    iconUrl: serviceIconUrls.sonarr.light,
    isNotFoundError: (error) => error instanceof SonarrNotFoundError,
    mediaKind: "series",
    scriptName: metadata.name,
    serviceName: "Sonarr",
  });
}
