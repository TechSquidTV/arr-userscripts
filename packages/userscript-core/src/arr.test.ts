import { expect, test } from "vite-plus/test";
import { loadArrServerOptions } from "./arr.ts";
import type { GmXmlHttpRequestDetails, GmXmlHttpResponse } from "./gm.ts";

interface GmRequestController {
  abort(): void;
}

interface ArrTestGlobals {
  GM?: { readonly xmlHttpRequest?: () => never };
  GM_xmlhttpRequest?: (details: GmXmlHttpRequestDetails) => GmRequestController;
}

test("loads readable root-folder and quality-profile choices from an ARR server", async () => {
  const globals = globalThis as typeof globalThis & ArrTestGlobals;
  const originalLegacyRequest = globals.GM_xmlhttpRequest;
  const originalModernRequest = globals.GM;
  const requests: GmXmlHttpRequestDetails[] = [];
  globals.GM_xmlhttpRequest = (details) => {
    requests.push(details);
    const response: GmXmlHttpResponse = details.url.endsWith("/rootfolder")
      ? {
          responseText: '[{"path":"/media/tv"},{"path":"/archive/tv"}]',
          status: 200,
          statusText: "OK",
        }
      : {
          responseText: '[{"id":4,"name":"Ultra-HD"},{"id":2,"name":"HD"}]',
          status: 200,
          statusText: "OK",
        };

    details.onload?.(response);
    return { abort: () => undefined };
  };
  delete globals.GM;

  try {
    await expect(
      loadArrServerOptions({ apiKey: "temporary-key", url: "https://arr.example.test" }),
    ).resolves.toEqual({
      qualityProfiles: [
        { label: "HD", value: "2" },
        { label: "Ultra-HD", value: "4" },
      ],
      rootFolders: [
        { label: "/archive/tv", value: "/archive/tv" },
        { label: "/media/tv", value: "/media/tv" },
      ],
    });
    expect(requests).toHaveLength(2);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          headers: expect.objectContaining({ "X-Api-Key": "temporary-key" }),
          url: "https://arr.example.test/api/v3/rootfolder",
        }),
        expect.objectContaining({ url: "https://arr.example.test/api/v3/qualityprofile" }),
      ]),
    );
  } finally {
    restoreRequestGlobals(globals, originalLegacyRequest, originalModernRequest);
  }
});

function restoreRequestGlobals(
  globals: typeof globalThis & ArrTestGlobals,
  legacyRequest: ArrTestGlobals["GM_xmlhttpRequest"],
  modernRequest: ArrTestGlobals["GM"],
): void {
  if (legacyRequest === undefined) {
    delete globals.GM_xmlhttpRequest;
  } else {
    globals.GM_xmlhttpRequest = legacyRequest;
  }

  if (modernRequest === undefined) {
    delete globals.GM;
  } else {
    globals.GM = modernRequest;
  }
}
