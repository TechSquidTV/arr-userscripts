// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { simulateTrustedClick } from "../../../tooling/test-dom.ts";
import type { ArrJsonValue } from "./arr.ts";
import type { GmXmlHttpRequestDetails, GmXmlHttpResponse } from "./gm.ts";

const services = ["sonarr", "radarr"] as const;
type Service = (typeof services)[number];
let notifyMutation: () => void;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal(
    "MutationObserver",
    class implements MutationObserver {
      public constructor(callback: MutationCallback) {
        notifyMutation = () => callback([], this);
      }
      public observe(): void {}
      public disconnect(): void {}
      public takeRecords(): MutationRecord[] {
        return [];
      }
    },
  );
});

afterEach(() => {
  // Dispose the mounted control and its document listeners before resetting DOM.
  window.history.replaceState(null, "", "/");
  notifyMutation?.();
  vi.advanceTimersByTime(50);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function renderTitle(service: Service, imdbId = "tt1234567"): void {
  window.history.replaceState(null, "", `/title/${imdbId}/`);
  document.body.innerHTML = `
    <script type="application/ld+json">{"@type":"${service === "sonarr" ? "TVSeries" : "Movie"}"}</script>
    <div id="watchlist"><div class="ipc-split-button"><button data-testid="tm-box-wl-button">Watchlist</button><button>Another list</button></div></div>
    <button id="outside">Outside</button>
  `;
}

const libraryItem = { id: 42, imdbId: "tt1234567", monitored: true, titleSlug: "example" };

async function mountFixture(
  service: Service,
  options: {
    readonly library?: ArrJsonValue;
    readonly status?: number;
    readonly deferred?: boolean;
    readonly configured?: boolean;
    readonly intercept?: (details: GmXmlHttpRequestDetails) => boolean;
  } = {},
) {
  const settings = {
    [`${service}ApiKey`]: "test-key",
    [`${service}Url`]: `https://${service}.example.test/arr`,
    [`${service}RootFolder`]: "/media",
    [`${service}QualityProfileId`]: "1",
    [`${service}Monitored`]: "true",
  };
  vi.stubGlobal(
    service === "sonarr"
      ? "ARR_USERSCRIPTS_IMDB_SONARR_DEFAULTS"
      : "ARR_USERSCRIPTS_IMDB_RADARR_DEFAULTS",
    options.configured === false ? {} : settings,
  );
  vi.stubGlobal("GM_getValue", () => "");
  vi.stubGlobal("GM_registerMenuCommand", () => undefined);
  const requests: GmXmlHttpRequestDetails[] = [];
  let library: ArrJsonValue = options.library ?? [];
  let status = options.status ?? 200;
  const respond = (details: GmXmlHttpRequestDetails): void => {
    if (options.intercept?.(details) === true) {
      return;
    }

    details.onload?.({
      status,
      statusText: status === 200 ? "OK" : "Unauthorized",
      responseText: JSON.stringify(
        details.method === "POST"
          ? libraryItem
          : details.url.includes("lookup?")
            ? [{ ...libraryItem, id: 0 }]
            : library,
      ),
    });
  };
  vi.stubGlobal("GM_xmlhttpRequest", (details: GmXmlHttpRequestDetails) => {
    requests.push(details);
    if (options.deferred !== true) {
      respond(details);
    }
    return { abort() {} };
  });
  renderTitle(service);
  if (service === "sonarr") {
    await import("../../../apps/imdb-sonarr/src/main.ts");
  } else {
    await import("../../../apps/imdb-radarr/src/main.ts");
  }
  await vi.advanceTimersByTimeAsync(50);
  const button = document.getElementById(`arr-userscripts-${service}-button`);
  const container = button?.closest(".arr-imdb-control");
  const toggle = container?.querySelector(".arr-imdb-toggle");
  const menu = container?.querySelector(".arr-imdb-menu");
  const link = menu?.querySelector("a");
  const refresh = menu?.querySelector("button");
  if (
    !(button instanceof HTMLButtonElement) ||
    !(container instanceof HTMLDivElement) ||
    !(toggle instanceof HTMLButtonElement) ||
    !(menu instanceof HTMLDivElement) ||
    !(link instanceof HTMLAnchorElement) ||
    !(refresh instanceof HTMLButtonElement)
  ) {
    throw new Error(`Missing ${service} split button.`);
  }
  return {
    button,
    container,
    toggle,
    menu,
    link,
    refresh,
    requests,
    respond,
    name: service === "sonarr" ? "Sonarr" : "Radarr",
    setLibrary: (nextLibrary: ArrJsonValue) => {
      library = nextLibrary;
    },
    setStatus: (nextStatus: number) => {
      status = nextStatus;
    },
  };
}

test.each(services)("%s checks on mount but only adds after a trusted click", async (service) => {
  const fixture = await mountFixture(service);
  const { button, requests, name, link } = fixture;
  expect(requests.map((request) => request.method)).toEqual(["GET"]);
  expect(button.textContent).toBe(`Add to ${name}`);
  expect(link.href).toBe(`https://${service}.example.test/arr/add/new?term=imdb%3Att1234567`);
  button.click();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  fixture.refresh.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toHaveLength(1);
  simulateTrustedClick(button);
  simulateTrustedClick(button);
  await vi.advanceTimersByTimeAsync(0);
  expect(requests.map((request) => request.method)).toEqual(["GET", "GET", "GET", "POST"]);
  const addRequest = requests[3];
  expect(addRequest?.headers?.["X-Api-Key"]).toBe("test-key");
  expect(JSON.parse(addRequest?.data ?? "{}")).toMatchObject({
    imdbId: "tt1234567",
    qualityProfileId: 1,
    rootFolderPath: "/media",
    monitored: true,
  });
  expect(button.textContent).toBe(`Monitored in ${name}`);
  expect(link.href).toBe(
    `https://${service}.example.test/arr/${service === "sonarr" ? "series" : "movie"}/example`,
  );
  simulateTrustedClick(button);
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toHaveLength(4);
});

test.each(services)("%s recognizes monitored and unmonitored library items", async (service) => {
  const fixture = await mountFixture(service, { library: [libraryItem] });
  expect(fixture.button.textContent).toBe(`Monitored in ${fixture.name}`);
  expect(fixture.button.disabled).toBe(true);
  expect(fixture.button.style.backgroundColor).toBe("#16a34a");
  expect(fixture.toggle.style.backgroundColor).toBe("#16a34a");
  expect(fixture.button.querySelectorAll("img")).toHaveLength(1);
  expect(fixture.button.querySelector("svg")).toBeNull();
  expect(fixture.button.textContent).not.toMatch(/[✓✔✅]/);
  expect(fixture.toggle.disabled).toBe(false);
  expect(fixture.link.href).toContain("/example");
  fixture.setLibrary([{ ...libraryItem, monitored: false }]);
  simulateTrustedClick(fixture.refresh);
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.button.textContent).toBe(`In ${fixture.name} (unmonitored)`);
  expect(fixture.requests.every((request) => request.method === "GET")).toBe(true);
  fixture.setLibrary([]);
  simulateTrustedClick(fixture.refresh);
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.button.textContent).toBe(`Add to ${fixture.name}`);
  expect(fixture.link.href).toContain("/add/new?term=imdb%3Att1234567");
});

test.each(services)("%s rechecks before adding to prevent duplicates", async (service) => {
  const fixture = await mountFixture(service);
  fixture.setLibrary([libraryItem]);
  simulateTrustedClick(fixture.button);
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.button.textContent).toBe(`Monitored in ${fixture.name}`);
  expect(fixture.requests.map((request) => request.method)).toEqual(["GET", "GET"]);
});

test.each(services)("%s shows failed checks and retries without adding", async (service) => {
  const fixture = await mountFixture(service, { status: 401 });
  expect(fixture.button.textContent).toBe(`Retry ${fixture.name} check`);
  expect(fixture.button.title).toContain("401");
  expect(fixture.link.href).toContain("/add/new?");
  simulateTrustedClick(fixture.button);
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.requests.map((request) => request.method)).toEqual(["GET", "GET"]);
  fixture.setStatus(200);
  simulateTrustedClick(fixture.button);
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.button.textContent).toBe(`Add to ${fixture.name}`);
  expect(fixture.requests).toHaveLength(3);
});

test.each(services)("%s does not add when the pre-add library check fails", async (service) => {
  const fixture = await mountFixture(service);
  fixture.setStatus(401);
  simulateTrustedClick(fixture.button);
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.button.textContent).toBe(`Retry ${fixture.name} check`);
  expect(fixture.requests.map((request) => request.method)).toEqual(["GET", "GET"]);
});

const requestFailures = [
  {
    name: "validation rejection",
    event: "onload",
    response: {
      status: 400,
      statusText: "Bad Request",
      responseText:
        '[{"propertyName":"RootFolderPath","errorMessage":"Root folder does not exist."}]',
    },
    detail: "Root folder does not exist.",
  },
  {
    name: "server error",
    event: "onload",
    response: {
      status: 500,
      statusText: "Internal Server Error",
      responseText: '{"message":"Metadata service unavailable.","stackTrace":"internal details"}',
    },
    detail: "Metadata service unavailable.",
  },
  {
    name: "invalid JSON",
    event: "onload",
    response: { status: 200, statusText: "OK", responseText: "not JSON" },
    detail: "returned invalid JSON",
  },
  {
    name: "network error",
    event: "onerror",
    response: { status: 0, statusText: "", responseText: "" },
    detail: "The request failed.",
  },
  {
    name: "timeout",
    event: "ontimeout",
    response: { status: 0, statusText: "", responseText: "" },
    detail: "The request timed out.",
  },
] as const satisfies readonly {
  readonly name: string;
  readonly event: "onload" | "onerror" | "ontimeout";
  readonly response: GmXmlHttpResponse;
  readonly detail: string;
}[];

for (const service of services) {
  for (const phase of ["lookup", "add"] as const) {
    test.each(requestFailures)(
      `${service} captures ${phase} $name and recovers`,
      async (failure) => {
        let failing = true;
        const fixture = await mountFixture(service, {
          intercept: (details) => {
            const matchesPhase =
              phase === "add" ? details.method === "POST" : details.url.includes("lookup?");
            if (!failing || !matchesPhase) {
              return false;
            }
            details[failure.event]?.(failure.response);
            return true;
          },
        });
        simulateTrustedClick(fixture.button);
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.button.textContent).toBe(`Unable to add to ${fixture.name}`);
        expect(fixture.button.title).toContain(failure.detail);
        expect(fixture.button.title).not.toContain("internal details");
        expect(fixture.button.disabled).toBe(false);
        expect(fixture.refresh.disabled).toBe(false);
        expect(fixture.button.style.backgroundColor).toBe("#dc2626");
        expect(fixture.link.href).toContain("/add/new?");
        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining("Could not add title for tt1234567"),
          expect.objectContaining({ message: expect.stringContaining(failure.detail) }),
        );
        expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(
          phase === "add" ? 1 : 0,
        );
        expect(fixture.requests.every((request) => request.timeout === 15_000)).toBe(true);

        failing = false;
        simulateTrustedClick(fixture.button);
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.button.textContent).toBe(`Add to ${fixture.name}`);
        simulateTrustedClick(fixture.button);
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.button.textContent).toBe(`Monitored in ${fixture.name}`);
      },
    );
  }
}

test.each(services)("%s ignores missing metadata on unrelated library items", async (service) => {
  const fixture = await mountFixture(service, { library: [{ imdbId: null }, libraryItem] });
  expect(fixture.button.textContent).toBe(`Monitored in ${fixture.name}`);
});

test.each(services)(
  "%s rejects malformed libraries without reporting an absent title",
  async (service) => {
    const fixture = await mountFixture(service, { library: {} });
    expect(fixture.button.textContent).toBe(`Retry ${fixture.name} check`);
    expect(fixture.requests).toHaveLength(1);
  },
);

test("the dropdown supports keyboard access, Escape, outside clicks, and focus dismissal", async () => {
  const { toggle, menu, link, refresh, requests } = await mountFixture("sonarr");
  expect(menu.hidden).toBe(true);
  toggle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  expect(menu.hidden).toBe(false);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(link);
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
  link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(menu.hidden).toBe(true);
  expect(document.activeElement).toBe(toggle);
  toggle.click();
  document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(menu.hidden).toBe(true);
  toggle.click();
  refresh.focus();
  expect(menu.hidden).toBe(false);
  document.getElementById("outside")?.focus();
  expect(menu.hidden).toBe(true);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(requests).toHaveLength(1);
});

test("IMDb rerenders reuse the split button without repeating the library request", async () => {
  const fixture = await mountFixture("sonarr", { library: [libraryItem] });
  renderTitle("sonarr");
  notifyMutation();
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelectorAll(".arr-imdb-control")).toHaveLength(1);
  expect(fixture.container.isConnected).toBe(true);
  expect(fixture.container.previousElementSibling?.id).toBe("watchlist");
  expect(fixture.requests).toHaveLength(1);
  expect(fixture.button.textContent).toBe("Monitored in Sonarr");
});

test("late status responses cannot overwrite a newly navigated title", async () => {
  const fixture = await mountFixture("sonarr", { deferred: true, library: [libraryItem] });
  expect(fixture.button.textContent).toBe("Checking Sonarr…");
  expect(fixture.button.disabled).toBe(true);
  expect(fixture.refresh.disabled).toBe(true);
  renderTitle("sonarr", "tt36984433");
  notifyMutation();
  await vi.advanceTimersByTimeAsync(50);
  const current = document.getElementById("arr-userscripts-sonarr-button");
  const [first, second] = fixture.requests;
  if (first === undefined || second === undefined) {
    throw new Error("Missing library requests.");
  }
  fixture.respond(second);
  await vi.advanceTimersByTimeAsync(0);
  expect(current?.textContent).toBe("Add to Sonarr");
  fixture.respond(first);
  await vi.advanceTimersByTimeAsync(0);
  expect(current?.textContent).toBe("Add to Sonarr");
  expect(fixture.container.isConnected).toBe(false);
});

test("incomplete setup shows configuration without issuing library requests", async () => {
  const fixture = await mountFixture("sonarr", { configured: false });
  expect(fixture.button.textContent).toBe("Configure Sonarr");
  expect(fixture.button.disabled).toBe(false);
  expect(fixture.toggle.hidden).toBe(true);
  expect(fixture.requests).toHaveLength(0);
});
