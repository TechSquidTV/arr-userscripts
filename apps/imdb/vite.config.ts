import { loadEnv, type ConfigEnv } from "vite";
import {
  defineUserscriptConfig,
  resolveConnectHosts,
  withReleaseMetadata,
} from "../../tooling/userscript.ts";
import { metadata } from "./src/metadata.ts";

export default function config({ mode }: ConfigEnv) {
  const environment = loadEnv(mode, "../..", "ARR_");
  const isRelease = mode === "release";

  return defineUserscriptConfig({
    envDir: "../..",
    envPrefix: "ARR_",
    entry: "src/main.ts",
    fileName: "imdb.user.js",
    globalName: "ArrUserscriptsImdb",
    metadata: withReleaseMetadata(
      {
        ...metadata,
        connects: isRelease ? ["*"] : resolveConnectHosts([environment.ARR_SONARR_URL]),
      },
      "imdb.user.js",
      mode,
    ),
    settings: {
      constantName: "ARR_USERSCRIPTS_IMDB_DEFAULTS",
      values: {
        sonarrLanguageProfileId: isRelease
          ? ""
          : (environment.ARR_SONARR_LANGUAGE_PROFILE_ID ?? ""),
        sonarrMonitored: isRelease ? "true" : (environment.ARR_SONARR_MONITORED ?? "true"),
        sonarrQualityProfileId: isRelease ? "" : (environment.ARR_SONARR_QUALITY_PROFILE_ID ?? ""),
        sonarrRootFolder: isRelease ? "" : (environment.ARR_SONARR_ROOT_FOLDER ?? ""),
        sonarrSearchForMissingEpisodes: isRelease
          ? "true"
          : (environment.ARR_SONARR_SEARCH_FOR_MISSING_EPISODES ?? "true"),
        sonarrUrl: isRelease ? "" : (environment.ARR_SONARR_URL ?? ""),
      },
    },
  });
}
