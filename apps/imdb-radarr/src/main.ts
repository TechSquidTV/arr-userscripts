import {
  getRadarrConfig,
  initializeScriptSettings,
  mountImdbArrIntegration,
  radarrServerOptionsLoader,
  radarrSettingsFields,
  RadarrClient,
  RadarrNotFoundError,
  serviceIconUrls,
} from "@arr-userscripts/core";
import { metadata } from "./metadata.ts";

declare const ARR_USERSCRIPTS_IMDB_RADARR_DEFAULTS: Readonly<Record<string, string>>;

void initialize();

async function initialize(): Promise<void> {
  const settings = await initializeScriptSettings({
    defaults: ARR_USERSCRIPTS_IMDB_RADARR_DEFAULTS,
    fields: radarrSettingsFields,
    menuCaption: "Configure Arr* Userscripts: IMDb Radarr",
    serverOptionsLoader: radarrServerOptionsLoader,
    storageKey: "arr-userscripts/imdb-radarr/settings-v1",
    validate: (values) => {
      const config = getRadarrConfig(values);
      return config instanceof Error ? config : undefined;
    },
  });
  mountImdbArrIntegration({
    buttonId: "arr-userscripts-radarr-button",
    createClient: (config) => {
      const client = new RadarrClient(config);

      return {
        add: (imdbId, currentConfig) => client.addMovie(imdbId, currentConfig),
        findExisting: (imdbId) => client.findExistingMovie(imdbId),
      };
    },
    getConfig: () => getRadarrConfig(settings),
    iconUrl: serviceIconUrls.radarr.light,
    isNotFoundError: (error) => error instanceof RadarrNotFoundError,
    mediaKind: "movie",
    scriptName: metadata.name,
    serviceName: "Radarr",
  });
}
