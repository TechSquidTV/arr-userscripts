import type { UserscriptMetadata } from "../../../tooling/userscript.ts";

export const metadata: UserscriptMetadata = {
  name: "Arr* Userscripts: Plex",
  author: "@techsquidtv",
  namespace: "https://github.com/techsquidtv/arr-userscripts",
  version: "0.1.1",
  description: "Open Plex television shows in Sonarr.",
  matches: ["https://app.plex.tv/*"],
  grants: [
    "GM_xmlhttpRequest",
    "GM.xmlHttpRequest",
    "GM_getValue",
    "GM.getValue",
    "GM_setValue",
    "GM.setValue",
    "GM_deleteValue",
    "GM.deleteValue",
    "GM_registerMenuCommand",
    "GM.registerMenuCommand",
  ],
  noFrames: true,
  runAt: "document-end",
};
