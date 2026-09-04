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
  { key: "plexServerUrl", label: "Plex server URL (optional)", type: "text" },
];

export const plexSecretFields = [{ key: "plexToken", label: "Plex token" }] as const;

export function getPlexConfig(
  settings: SettingsValues,
  token: string | undefined,
): Error | PlexConfig | undefined {
  const serverUrl = optionalEnvironmentValue(settings.plexServerUrl);
  const sessionToken = optionalEnvironmentValue(token);

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
