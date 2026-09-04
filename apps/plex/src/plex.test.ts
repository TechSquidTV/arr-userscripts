import { expect, test } from "vite-plus/test";
import { getPlexMetadataPath, getSonarrLookupTerms } from "./plex.ts";

test("reads a Plex metadata path from query and hash detail routes", () => {
  expect(
    getPlexMetadataPath("https://app.plex.tv/desktop/details?key=%2Flibrary%2Fmetadata%2F42"),
  ).toBe("/library/metadata/42");
  expect(
    getPlexMetadataPath("https://app.plex.tv/desktop/#!/details?key=%2Flibrary%2Fmetadata%2F84"),
  ).toBe("/library/metadata/84");
  expect(
    getPlexMetadataPath("https://app.plex.tv/desktop/#!/details?key=/library/sections/1"),
  ).toBeUndefined();
});

test("prefers stable Plex identifiers when looking up Sonarr titles", () => {
  expect(
    getSonarrLookupTerms([
      "tmdb://101",
      "imdb://tt1234567",
      "tvdb://202",
      "imdb://tt7654321",
      "unsupported://303",
      null,
    ]),
  ).toEqual(["imdb:tt1234567", "tvdb:202", "tmdb:101"]);
});
