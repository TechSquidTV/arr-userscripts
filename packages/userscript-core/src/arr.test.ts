import { afterEach, expect, test, vi } from "vite-plus/test";
import { loadArrServerOptions } from "./arr.ts";
import type { GmXmlHttpRequestDetails, GmXmlHttpResponse } from "./gm.ts";

interface GmRequestController {
  abort(): void;
}

interface ArrTestGlobals {
  GM?: { readonly xmlHttpRequest?: () => never };
  GM_xmlhttpRequest?: (details: GmXmlHttpRequestDetails) => GmRequestController;
}

afterEach(() => vi.unstubAllGlobals());

test.each([
  {
    responseText: "<html><body>Proxy failure: private internal details</body></html>",
    expected: "returned 502 Bad Gateway.",
    omitted: "private internal details",
  },
  {
    responseText: JSON.stringify({
      message: "Rejected API key temporary-key.",
      stackTrace: "private internal details",
    }),
    expected: "Rejected API key [redacted].",
    omitted: "temporary-key",
  },
  {
    responseText: JSON.stringify([
      { errorMessage: "Invalid profile." },
      { errorMessage: "Invalid profile." },
      { errorMessage: "Invalid folder." },
    ]),
    expected: "Invalid profile. Invalid folder.",
    omitted: "Invalid profile. Invalid profile.",
  },
])(
  "keeps useful HTTP error details without dumping response bodies ($expected)",
  async ({ responseText, expected, omitted }) => {
    vi.stubGlobal("GM_xmlhttpRequest", (details: GmXmlHttpRequestDetails) => {
      details.onload?.({ status: 502, statusText: "Bad Gateway", responseText });
      return { abort() {} };
    });
    const result = loadArrServerOptions({
      apiKey: "temporary-key",
      url: "https://arr.example.test",
    });
    await expect(result).rejects.toThrow(expected);
    await expect(result).rejects.toThrow(
      "GET https://arr.example.test/api/v3/rootfolder returned 502 Bad Gateway.",
    );
    await expect(result).rejects.not.toThrow(omitted);
    await expect(result).rejects.not.toThrow("private internal details");
  },
);

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
