import plexDark from "./assets/plex-dark.svg?url";
import plexLight from "./assets/plex-light.svg?url";
import plex from "./assets/plex.svg?url";
import radarrLight from "./assets/radarr-light.svg?url";
import sonarrLight from "./assets/sonarr-light.svg?url";

/** Bundled from https://github.com/selfhst/icons for CSP-safe userscript UI. */
export const serviceIconUrls = Object.freeze({
  plex: Object.freeze({ dark: plexDark, default: plex, light: plexLight }),
  radarr: Object.freeze({ light: radarrLight }),
  sonarr: Object.freeze({ light: sonarrLight }),
});
