import {
  optionalEnvironmentValue,
  parseHttpUrl,
  requireEnvironmentValue,
} from "@arr-userscripts/core";
import type { SettingsField, SettingsValues } from "@arr-userscripts/core";

export interface PlexConfig {
  readonly token: string;
  readonly url: string;
}

export const plexSettingsFields: readonly SettingsField[] = [
  {
    hint: "Optional. Lets the script confirm the item is a TV show before showing Sonarr.",
    key: "plexServerUrl",
    label: "Plex server URL",
    type: "text",
  },
  {
    hint: "Optional. Store it locally to verify Plex media types and prefer exact identifiers.",
    key: "plexToken",
    label: "Plex token",
    type: "password",
  },
];

export function getPlexConfig(settings: SettingsValues): Error | PlexConfig | undefined {
  const serverUrl = optionalEnvironmentValue(settings.plexServerUrl);
  const sessionToken = optionalEnvironmentValue(settings.plexToken);

  if (serverUrl === undefined && sessionToken === undefined) {
    return undefined;
  }

  if (serverUrl === undefined || sessionToken === undefined) {
    return new Error("Plex server URL and Plex token must be configured together.");
  }

  try {
    return {
      token: requireEnvironmentValue(sessionToken, "Plex token"),
      url: parseHttpUrl(serverUrl, "Plex server URL"),
    };
  } catch (error) {
    return error instanceof Error ? error : new Error("Unable to read Plex configuration.");
  }
}
