import { defineConfig } from "vite-plus";

export interface UserscriptMetadata {
  readonly name: string;
  readonly author?: string;
  readonly namespace: string;
  readonly version: string;
  readonly description: string;
  readonly matches?: readonly string[];
  readonly excludeMatches?: readonly string[];
  readonly includes?: readonly string[];
  readonly excludes?: readonly string[];
  readonly requires?: readonly string[];
  readonly resources?: Readonly<Record<string, string>>;
  readonly connects?: readonly string[];
  readonly grants?: readonly UserscriptGrant[];
  readonly noFrames?: boolean;
  readonly icon?: string;
  readonly homepageURL?: string;
  readonly downloadURL?: string;
  readonly updateURL?: string;
  readonly supportURL?: string;
  readonly injectInto?: "auto" | "page" | "content";
  readonly tags?: readonly string[];
  readonly runAt: "document-start" | "document-body" | "document-end" | "document-idle";
}

export type UserscriptGrant =
  | "none"
  | "unsafeWindow"
  | "window.close"
  | "window.focus"
  | `GM_${string}`
  | `GM.${string}`;

export type UserscriptSettingValue = boolean | number | string;

export interface UserscriptBuildOptions {
  readonly envDir?: string;
  readonly envPrefix?: string;
  readonly entry: string;
  readonly fileName: string;
  readonly globalName: string;
  readonly metadata: UserscriptMetadata;
  readonly settings?: {
    readonly constantName: string;
    readonly values: Readonly<Record<string, UserscriptSettingValue>>;
  };
}

export function formatUserscriptBanner(metadata: UserscriptMetadata): string {
  assertGrantsAreValid(metadata.grants ?? []);

  const lines = [
    "// ==UserScript==",
    metadataLine("name", metadata.name),
    ...(metadata.author === undefined ? [] : [metadataLine("author", metadata.author)]),
    metadataLine("namespace", metadata.namespace),
    metadataLine("version", metadata.version),
    metadataLine("description", metadata.description),
    ...(metadata.matches?.map((match) => metadataLine("match", match)) ?? []),
    ...(metadata.excludeMatches?.map((match) => metadataLine("exclude-match", match)) ?? []),
    ...(metadata.includes?.map((include) => metadataLine("include", include)) ?? []),
    ...(metadata.excludes?.map((exclude) => metadataLine("exclude", exclude)) ?? []),
    ...(metadata.requires?.map((requirement) => metadataLine("require", requirement)) ?? []),
    ...Object.entries(metadata.resources ?? {}).map(([name, url]) =>
      metadataLine("resource", `${name} ${url}`),
    ),
    ...(metadata.connects?.map((connect) => metadataLine("connect", connect)) ?? []),
    ...(metadata.grants?.map((grant) => metadataLine("grant", grant)) ?? []),
    ...(metadata.noFrames ? [metadataLine("noframes")] : []),
    ...(metadata.icon === undefined ? [] : [metadataLine("icon", metadata.icon)]),
    ...(metadata.homepageURL === undefined
      ? []
      : [metadataLine("homepageURL", metadata.homepageURL)]),
    ...(metadata.downloadURL === undefined
      ? []
      : [metadataLine("downloadURL", metadata.downloadURL)]),
    ...(metadata.updateURL === undefined ? [] : [metadataLine("updateURL", metadata.updateURL)]),
    ...(metadata.supportURL === undefined ? [] : [metadataLine("supportURL", metadata.supportURL)]),
    ...(metadata.injectInto === undefined
      ? []
      : [metadataLine("inject-into", metadata.injectInto)]),
    ...(metadata.tags?.map((tag) => metadataLine("tag", tag)) ?? []),
    metadataLine("run-at", metadata.runAt),
    "// ==/UserScript==",
  ];

  return `${lines.join("\n")}\n`;
}

/**
 * Derive the least-privileged userscript `@connect` hosts from configured server
 * URLs. An unconfigured local build keeps the wildcard so it remains installable
 * after the user supplies configuration at build time.
 */
export function resolveConnectHosts(urls: readonly (string | undefined)[]): readonly string[] {
  const hosts = new Set<string>();

  for (const url of urls) {
    if (url === undefined || url.trim().length === 0) {
      continue;
    }

    try {
      hosts.add(new URL(url).hostname);
    } catch {
      // Runtime configuration validation provides the user-facing error.
    }
  }

  return hosts.size === 0 ? ["*"] : [...hosts];
}

export function splitCommaSeparatedValues(value: string | undefined): readonly string[] {
  return value === undefined
    ? []
    : value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

/** Convert configured web URLs into precise userscript @match patterns. */
export function resolveUrlMatchPatterns(urls: readonly string[]): readonly string[] {
  const matches = new Set<string>();

  for (const value of urls) {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new Error(`Invalid userscript match URL: ${value}`);
    }

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error(`Invalid userscript match URL: ${value}`);
    }

    matches.add(`${url.protocol}//${url.host}/*`);
  }

  return [...matches];
}

export function defineUserscriptConfig(options: UserscriptBuildOptions) {
  return defineConfig({
    ...(options.envDir === undefined ? {} : { envDir: options.envDir }),
    ...(options.envPrefix === undefined ? {} : { envPrefix: options.envPrefix }),
    build: {
      emptyOutDir: true,
      lib: {
        entry: options.entry,
        formats: ["iife"],
        name: options.globalName,
        fileName: () => options.fileName,
      },
      rolldownOptions: {
        output: {
          // Rolldown adds postBanner after minification, preserving the
          // userscript metadata block and editable settings at byte zero.
          postBanner: formatUserscriptPreamble(options.metadata, options.settings),
        },
      },
      target: "es2022",
    },
  });
}

export function formatUserscriptPreamble(
  metadata: UserscriptMetadata,
  settings?: UserscriptBuildOptions["settings"],
): string {
  if (settings === undefined) {
    return formatUserscriptBanner(metadata);
  }

  if (!/^[A-Z][A-Z0-9_]*$/.test(settings.constantName)) {
    throw new Error("Userscript settings constant names must be uppercase identifiers.");
  }

  return `${formatUserscriptBanner(metadata)}
/*
 * Arr* Userscripts configuration defaults
 * Edit these values before installation if preferred. Values saved through the
 * userscript manager's Configure menu override these defaults and survive updates.
 * API keys and tokens are requested for each page and are never saved here.
 */
const ${settings.constantName} = Object.freeze(${JSON.stringify(settings.values, null, 2)});
`;
}

export function withReleaseMetadata(
  metadata: UserscriptMetadata,
  fileName: string,
  mode: string,
): UserscriptMetadata {
  if (mode !== "release" && mode !== "personal-release") {
    return metadata;
  }

  const version = process.env.RELEASE_VERSION;

  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Release builds require RELEASE_VERSION in X.Y.Z format.");
  }

  const repository = process.env.RELEASE_REPOSITORY ?? "techsquidtv/arr-userscripts";
  const releaseTag = process.env.RELEASE_TAG;

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("RELEASE_REPOSITORY must be in owner/repository format.");
  }

  if (releaseTag !== undefined && !/^[A-Za-z0-9_.-]+$/.test(releaseTag)) {
    throw new Error(
      "RELEASE_TAG must contain only letters, numbers, dots, underscores, or hyphens.",
    );
  }

  const assetUrl =
    releaseTag === undefined
      ? `https://github.com/${repository}/releases/latest/download/${fileName}`
      : `https://github.com/${repository}/releases/download/${releaseTag}/${fileName}`;

  return {
    ...metadata,
    downloadURL: assetUrl,
    updateURL: assetUrl,
    version,
  };
}

function assertGrantsAreValid(grants: readonly UserscriptGrant[]): void {
  if (grants.includes("none") && grants.length > 1) {
    throw new Error('"none" cannot be combined with other userscript grants.');
  }
}

function metadataLine(key: string, value?: string): string {
  return value === undefined ? `// @${key}` : `// @${key} ${value}`;
}
