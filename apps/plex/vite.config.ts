import { loadEnv, type ConfigEnv } from "vite";
import {
  defineUserscriptConfig,
  resolveConnectHosts,
  resolveUrlMatchPatterns,
  splitCommaSeparatedValues,
  withReleaseMetadata,
} from "../../tooling/userscript.ts";
import { metadata } from "./src/metadata.ts";

export default function config({ mode }: ConfigEnv) {
  const environment = loadEnv(mode, "../..", "ARR_");
  const isRelease = mode === "release";
  const isPersonalRelease = mode === "personal-release";
  const isDistributionBuild = isRelease || isPersonalRelease;
  const configuredPlexWebUrls = splitCommaSeparatedValues(environment.ARR_PLEX_WEB_URLS);

  return defineUserscriptConfig({
    envDir: "../..",
    envPrefix: "ARR_",
    entry: "src/main.ts",
    fileName: "plex.user.js",
    globalName: "ArrUserscriptsPlex",
    metadata: withReleaseMetadata(
      {
        ...metadata,
        matches: [
          ...(metadata.matches ?? []),
          ...(isRelease
            ? []
            : resolveUrlMatchPatterns(
                isPersonalRelease
                  ? configuredPlexWebUrls
                  : [environment.ARR_PLEX_SERVER_URL, ...configuredPlexWebUrls].filter(
                      (url): url is string => url !== undefined && url.trim().length > 0,
                    ),
              )),
        ],
        connects: isDistributionBuild
          ? ["*"]
          : resolveConnectHosts([environment.ARR_PLEX_SERVER_URL, environment.ARR_SONARR_URL]),
      },
      "plex.user.js",
      mode,
    ),
    settings: {
      constantName: "ARR_USERSCRIPTS_PLEX_DEFAULTS",
      values: {
        plexServerUrl: isDistributionBuild ? "" : (environment.ARR_PLEX_SERVER_URL ?? ""),
        plexToken: "",
        sonarrApiKey: "",
        sonarrUrl: isDistributionBuild ? "" : (environment.ARR_SONARR_URL ?? ""),
      },
    },
  });
}
