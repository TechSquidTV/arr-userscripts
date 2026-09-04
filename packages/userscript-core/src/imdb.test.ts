import { expect, test } from "vite-plus/test";
import { classifyImdbJsonLd, classifyImdbTitleSignals, getImdbTitleId } from "./imdb.ts";

test("classifies IMDb JSON-LD movies", () => {
  expect(classifyImdbJsonLd('{"@context":"https://schema.org","@type":"Movie"}')).toBe("movie");
});

test("classifies IMDb JSON-LD television series", () => {
  expect(classifyImdbJsonLd('{"@graph":[{"@type":"WebPage"},{"@type":"TVSeries"}]}')).toBe(
    "series",
  );
});

test("rejects ambiguous and unsupported IMDb JSON-LD", () => {
  expect(classifyImdbJsonLd('{"@type":["Movie","TVSeries"]}')).toBe("unknown");
  expect(classifyImdbJsonLd('{"@type":"TVEpisode"}')).toBe("unknown");
  expect(classifyImdbJsonLd("not JSON")).toBe("unknown");
});

test("extracts an IMDb title identifier from an IMDb title path", () => {
  expect(getImdbTitleId("/title/tt0133093/plotsummary/")).toBe("tt0133093");
  expect(getImdbTitleId("/name/nm0000001/")).toBeUndefined();
});

test("uses IMDb's episode guide marker as a series fallback", () => {
  expect(
    classifyImdbTitleSignals({
      hasEpisodeGuide: true,
      hasMoviePopularityLink: false,
      jsonLd: [],
    }),
  ).toBe("series");
});

test("uses IMDb's MovieMeter link as a movie fallback", () => {
  expect(
    classifyImdbTitleSignals({
      hasEpisodeGuide: false,
      hasMoviePopularityLink: true,
      jsonLd: [],
    }),
  ).toBe("movie");
});

test("keeps ambiguous IMDb pages unsupported", () => {
  expect(
    classifyImdbTitleSignals({
      hasEpisodeGuide: false,
      hasMoviePopularityLink: false,
      jsonLd: ['{"@type":["Movie","TVSeries"]}'],
    }),
  ).toBe("unknown");
});
