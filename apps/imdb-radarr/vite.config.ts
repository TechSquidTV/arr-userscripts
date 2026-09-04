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
    fileName: "imdb-radarr.user.js",
    globalName: "ArrUserscriptsImdbRadarr",
    metadata: withReleaseMetadata(
      {
        ...metadata,
        connects: isRelease ? ["*"] : resolveConnectHosts([environment.ARR_RADARR_URL]),
      },
      "imdb-radarr.user.js",
      mode,
    ),
    settings: {
      constantName: "ARR_USERSCRIPTS_IMDB_RADARR_DEFAULTS",
      values: {
        radarrApiKey: "",
        radarrMonitored: isRelease ? "true" : (environment.ARR_RADARR_MONITORED ?? "true"),
        radarrQualityProfileId: isRelease ? "" : (environment.ARR_RADARR_QUALITY_PROFILE_ID ?? ""),
        radarrRootFolder: isRelease ? "" : (environment.ARR_RADARR_ROOT_FOLDER ?? ""),
        radarrSearchForMovie: isRelease
          ? "true"
          : (environment.ARR_RADARR_SEARCH_FOR_MOVIE ?? "true"),
        radarrUrl: isRelease ? "" : (environment.ARR_RADARR_URL ?? ""),
      },
    },
  });
}
