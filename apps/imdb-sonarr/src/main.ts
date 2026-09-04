import {
  getSonarrConfig,
  initializeScriptSettings,
  mountImdbArrIntegration,
  serviceIconUrls,
  sonarrServerOptionsLoader,
  sonarrSettingsFields,
  SonarrClient,
  SonarrNotFoundError,
} from "@arr-userscripts/core";
import { metadata } from "./metadata.ts";

declare const ARR_USERSCRIPTS_IMDB_SONARR_DEFAULTS: Readonly<Record<string, string>>;

void initialize();

async function initialize(): Promise<void> {
  const settings = await initializeScriptSettings({
    defaults: ARR_USERSCRIPTS_IMDB_SONARR_DEFAULTS,
    fields: sonarrSettingsFields,
    menuCaption: "Configure Arr* Userscripts: IMDb Sonarr",
    serverOptionsLoader: sonarrServerOptionsLoader,
    storageKey: "arr-userscripts/imdb-sonarr/settings-v1",
    validate: (values) => {
      const config = getSonarrConfig(values);
      return config instanceof Error ? config : undefined;
    },
  });
  mountImdbArrIntegration({
    buttonId: "arr-userscripts-sonarr-button",
    createClient: (config) => {
      const client = new SonarrClient(config);

      return {
        add: (imdbId, currentConfig) => client.addSeries(imdbId, currentConfig),
        findExisting: (imdbId) => client.findExistingSeries(imdbId),
      };
    },
    getConfig: () => getSonarrConfig(settings),
    iconUrl: serviceIconUrls.sonarr.light,
    isNotFoundError: (error) => error instanceof SonarrNotFoundError,
    mediaKind: "series",
    scriptName: metadata.name,
    serviceName: "Sonarr",
  });
}
