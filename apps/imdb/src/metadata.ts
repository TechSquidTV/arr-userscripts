import type { UserscriptMetadata } from "../../../tooling/userscript.ts";

export const metadata: UserscriptMetadata = {
  name: "ARR Userscripts: IMDb",
  author: "@techsquidtv",
  namespace: "https://github.com/techsquidtv/arr-userscripts",
  version: "0.1.0",
  description: "Add IMDb television shows to Sonarr and show their library status.",
  matches: ["*://*.imdb.com/title/tt*"],
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
