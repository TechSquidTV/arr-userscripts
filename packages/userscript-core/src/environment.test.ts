import { expect, test } from "vite-plus/test";
import { parseBoolean, parseHttpUrl, parsePositiveInteger } from "./environment.ts";

test("uses a default value for an omitted boolean environment variable", () => {
  expect(parseBoolean(undefined, "ARR_ENABLED", true)).toBe(true);
});

test("rejects malformed environment values", () => {
  expect(() => parseBoolean("yes", "ARR_ENABLED", true)).toThrow(
    'ARR_ENABLED must be either "true" or "false".',
  );
  expect(() => parsePositiveInteger("0", "ARR_PROFILE_ID")).toThrow(
    "ARR_PROFILE_ID must be a positive integer.",
  );
});

test("normalizes a Sonarr base URL", () => {
  expect(parseHttpUrl("https://sonarr.example.test/", "ARR_SONARR_URL")).toBe(
    "https://sonarr.example.test",
  );
});
