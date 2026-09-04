import { readFile } from "node:fs/promises";

const [version, ...assetPaths] = process.argv.slice(2);

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  throw new Error("Usage: node tooling/verify-release.mjs X.Y.Z <asset> [...asset]");
}

const assets = [
  {
    name: "imdb.user.js",
    settings: "ARR_USERSCRIPTS_IMDB_DEFAULTS",
    secretKeys: ["sonarrApiKey"],
  },
  {
    name: "imdb-radarr.user.js",
    settings: "ARR_USERSCRIPTS_IMDB_RADARR_DEFAULTS",
    secretKeys: ["radarrApiKey"],
  },
  {
    name: "plex.user.js",
    settings: "ARR_USERSCRIPTS_PLEX_DEFAULTS",
    secretKeys: ["plexToken", "sonarrApiKey"],
  },
];

if (assetPaths.length !== assets.length) {
  throw new Error(`Expected ${assets.length} release assets.`);
}

const sources = await Promise.all(assetPaths.map((path) => readFile(path, "utf8")));

for (const [index, asset] of assets.entries()) {
  const source = sources[index];
  const url = `https://github.com/techsquidtv/arr-userscripts/releases/latest/download/${asset.name}`;

  assertIncludes(source, `// @version ${version}`, asset.name);
  assertIncludes(source, "// @author @techsquidtv", asset.name);
  assertIncludes(source, `// @downloadURL ${url}`, asset.name);
  assertIncludes(source, `// @updateURL ${url}`, asset.name);
  assertIncludes(source, "// @connect *", asset.name);
  assertIncludes(source, "* ARR Userscripts configuration defaults", asset.name);
  assertIncludes(source, `const ${asset.settings} = Object.freeze({`, asset.name);

  const defaults = extractDefaultsBlock(source, asset.settings, asset.name);

  for (const secretKey of asset.secretKeys) {
    if (defaults.includes(`"${secretKey}"`)) {
      throw new Error(`${asset.name} includes a session-only secret in its editable defaults.`);
    }
  }
}

function extractDefaultsBlock(source, settingsName, assetName) {
  const start = source.indexOf(`const ${settingsName} = Object.freeze({`);
  const end = source.indexOf("\n});", start);

  if (start === -1 || end === -1) {
    throw new Error(`${assetName} is missing its editable defaults block.`);
  }

  return source.slice(start, end + 4);
}

for (const configuredValue of await loadSensitiveLocalValues()) {
  if (sources.some((source) => source.includes(configuredValue.value))) {
    throw new Error(
      `A .env.local value for ${configuredValue.name} leaked into a release artifact.`,
    );
  }
}

function assertIncludes(source, expected, assetName) {
  if (!source.includes(expected)) {
    throw new Error(`${assetName} is missing required release content: ${expected}`);
  }
}

async function loadSensitiveLocalValues() {
  let contents;

  try {
    contents = await readFile(".env.local", "utf8");
  } catch {
    return [];
  }

  return contents.split("\n").flatMap((line) => {
    const match =
      /^(ARR_(?:[A-Z0-9_]+(?:API_KEY|TOKEN|URL|ROOT_FOLDER|QUALITY_PROFILE_ID|LANGUAGE_PROFILE_ID|WEB_URLS)))=(.*)$/.exec(
        line,
      );

    if (
      match === null ||
      match[1] === undefined ||
      match[2] === undefined ||
      match[2].length === 0
    ) {
      return [];
    }

    return [{ name: match[1], value: match[2] }];
  });
}
