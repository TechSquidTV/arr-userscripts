import { expect, test } from "vite-plus/test";
import {
  formatUserscriptBanner,
  formatUserscriptPreamble,
  resolveConnectHosts,
  resolveUrlMatchPatterns,
  splitCommaSeparatedValues,
  withReleaseMetadata,
} from "./userscript.ts";

test("formats a userscript metadata block", () => {
  expect(
    formatUserscriptBanner({
      name: "Example",
      author: "@example",
      namespace: "https://example.com/userscripts",
      version: "1.0.0",
      description: "An example userscript",
      matches: ["https://example.com/*"],
      connects: ["example.com"],
      grants: ["none"],
      noFrames: true,
      runAt: "document-end",
    }),
  ).toBe(`// ==UserScript==
// @name Example
// @author @example
// @namespace https://example.com/userscripts
// @version 1.0.0
// @description An example userscript
// @match https://example.com/*
// @connect example.com
// @grant none
// @noframes
// @run-at document-end
// ==/UserScript==
`);
});

test("rejects a metadata block that combines grant none with a GM API", () => {
  expect(() =>
    formatUserscriptBanner({
      name: "Invalid",
      namespace: "https://example.com/userscripts",
      version: "1.0.0",
      description: "An invalid userscript",
      grants: ["none", "GM_xmlhttpRequest"],
      runAt: "document-end",
    }),
  ).toThrow('"none" cannot be combined with other userscript grants.');
});

test("derives unique connect hosts from configured server URLs", () => {
  expect(
    resolveConnectHosts([
      "https://sonarr.example.test:8989/api",
      "http://127.0.0.1:32400",
      "https://sonarr.example.test",
    ]),
  ).toEqual(["sonarr.example.test", "127.0.0.1"]);
});

test("uses the wildcard only when no server URL is configured", () => {
  expect(resolveConnectHosts([undefined, "not a URL"])).toEqual(["*"]);
});

test("creates precise match patterns from configured web URLs", () => {
  expect(
    resolveUrlMatchPatterns([
      "https://plex.example.test/web",
      "http://localhost:32400/web/index.html",
      "https://plex.example.test",
    ]),
  ).toEqual(["https://plex.example.test/*", "http://localhost:32400/*"]);
});

test("splits a comma-separated URL configuration list", () => {
  expect(splitCommaSeparatedValues(" https://plex.one , ,https://plex.two ")).toEqual([
    "https://plex.one",
    "https://plex.two",
  ]);
});

test("rejects non-web URLs in generated match patterns", () => {
  expect(() => resolveUrlMatchPatterns(["file:///Users/example/plex"])).toThrow(
    "Invalid userscript match URL",
  );
});

test("places editable defaults immediately after metadata", () => {
  const preamble = formatUserscriptPreamble(
    {
      name: "Example",
      namespace: "https://example.com/userscripts",
      version: "1.0.0",
      description: "An example userscript",
      runAt: "document-end",
    },
    {
      constantName: "EXAMPLE_DEFAULTS",
      values: { apiKey: "", enabled: "true" },
    },
  );

  expect(preamble).toContain(
    "// ==/UserScript==\n\n/*\n * Arr* Userscripts configuration defaults",
  );
  expect(preamble).toContain('const EXAMPLE_DEFAULTS = Object.freeze({\n  "apiKey": "",');
});

test("adds tag-derived stable release metadata", () => {
  const originalVersion = process.env.RELEASE_VERSION;
  const originalRepository = process.env.RELEASE_REPOSITORY;
  const originalTag = process.env.RELEASE_TAG;
  process.env.RELEASE_VERSION = "1.2.3";
  delete process.env.RELEASE_REPOSITORY;
  delete process.env.RELEASE_TAG;

  try {
    const metadata = withReleaseMetadata(
      {
        name: "Example",
        namespace: "https://example.com/userscripts",
        version: "0.0.0",
        description: "An example userscript",
        runAt: "document-end",
      },
      "example.user.js",
      "release",
    );

    expect(metadata.version).toBe("1.2.3");
    expect(metadata.downloadURL).toBe(
      "https://github.com/techsquidtv/arr-userscripts/releases/latest/download/example.user.js",
    );
    expect(metadata.updateURL).toBe(metadata.downloadURL);
  } finally {
    restoreEnvironmentValue("RELEASE_REPOSITORY", originalRepository);
    restoreEnvironmentValue("RELEASE_TAG", originalTag);
    restoreEnvironmentValue("RELEASE_VERSION", originalVersion);
  }
});

test("uses a fork-specific stable release tag for a personal build", () => {
  const originalVersion = process.env.RELEASE_VERSION;
  const originalRepository = process.env.RELEASE_REPOSITORY;
  const originalTag = process.env.RELEASE_TAG;
  process.env.RELEASE_REPOSITORY = "example-user/arr-userscripts";
  process.env.RELEASE_TAG = "personal-plex";
  process.env.RELEASE_VERSION = "0.1.42";

  try {
    const metadata = withReleaseMetadata(
      {
        name: "Example",
        namespace: "https://example.com/userscripts",
        version: "0.0.0",
        description: "An example userscript",
        runAt: "document-end",
      },
      "plex.user.js",
      "personal-release",
    );

    expect(metadata.version).toBe("0.1.42");
    expect(metadata.downloadURL).toBe(
      "https://github.com/example-user/arr-userscripts/releases/download/personal-plex/plex.user.js",
    );
    expect(metadata.updateURL).toBe(metadata.downloadURL);
  } finally {
    restoreEnvironmentValue("RELEASE_REPOSITORY", originalRepository);
    restoreEnvironmentValue("RELEASE_TAG", originalTag);
    restoreEnvironmentValue("RELEASE_VERSION", originalVersion);
  }
});

test("rejects release metadata without a semantic tag version", () => {
  const originalVersion = process.env.RELEASE_VERSION;
  delete process.env.RELEASE_VERSION;

  try {
    expect(() =>
      withReleaseMetadata(
        {
          name: "Example",
          namespace: "https://example.com/userscripts",
          version: "0.0.0",
          description: "An example userscript",
          runAt: "document-end",
        },
        "example.user.js",
        "release",
      ),
    ).toThrow("Release builds require RELEASE_VERSION in X.Y.Z format.");
  } finally {
    restoreEnvironmentValue("RELEASE_VERSION", originalVersion);
  }
});

function restoreEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
