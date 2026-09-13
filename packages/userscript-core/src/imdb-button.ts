export type ImdbArrButtonState = "default" | "error" | "loading" | "success";

export interface ImdbArrButton {
  readonly container: HTMLDivElement;
  readonly element: HTMLButtonElement;
  readonly refresh: HTMLButtonElement;
  remove(): void;
  setStatus(label: string, state: ImdbArrButtonState, detail?: string): void;
  setUrl(url: string): void;
}

export function createImdbArrButton(
  id: string,
  serviceName: string,
  iconUrl: string,
): ImdbArrButton {
  const container = document.createElement("div");
  const split = document.createElement("div");
  const element = document.createElement("button");
  const icon = document.createElement("img");
  const label = document.createElement("span");
  const toggle = document.createElement("button");
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const menu = document.createElement("div");
  const link = document.createElement("a");
  const refresh = document.createElement("button");
  const style = document.createElement("style");

  container.className = "arr-imdb-control";
  split.className =
    "ipc-split-button ipc-btn--theme-baseAlt ipc-split-button--ellide-false ipc-split-button--button-radius ipc-btn--core-accent1 ipc-split-button--width-full arr-imdb-split";
  element.id = id;
  element.type = "button";
  element.className = "ipc-split-button__btn ipc-split-button__btn--button-radius arr-imdb-primary";
  icon.alt = "";
  icon.height = 20;
  icon.src = iconUrl;
  icon.width = 20;
  label.className = "ipc-btn__text";
  label.setAttribute("aria-live", "polite");
  element.append(icon, label);

  toggle.type = "button";
  toggle.className =
    "ipc-split-button__iconBtn ipc-split-button__iconBtn--button-radius arr-imdb-toggle";
  toggle.setAttribute("aria-label", `${serviceName} actions`);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", `${id}-actions`);
  toggle.hidden = true;
  arrow.setAttribute("viewBox", "0 0 24 24");
  arrow.setAttribute("width", "24");
  arrow.setAttribute("height", "24");
  arrow.setAttribute("fill", "currentColor");
  arrow.setAttribute("aria-hidden", "true");
  path.setAttribute(
    "d",
    "M15.88 9.29 12 13.17 8.12 9.29a.996.996 0 1 0-1.41 1.41l4.59 4.59c.39.39 1.02.39 1.41 0l4.59-4.59a.996.996 0 0 0-1.42-1.41z",
  );
  arrow.append(path);
  toggle.append(arrow);
  for (const action of [element, toggle]) {
    // IMDb colors the two halves independently, regardless of the wrapper color.
    action.style.color = "#ffffff";
  }
  element.style.borderRight = "1px solid #ffffff40";

  menu.id = `${id}-actions`;
  menu.className = "arr-imdb-menu";
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", `${serviceName} actions`);
  menu.hidden = true;
  link.textContent = `Open in ${serviceName}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  refresh.type = "button";
  refresh.textContent = "Refresh library status";
  menu.append(link, refresh);
  split.append(element, toggle);
  style.textContent = buttonStyles;
  container.append(style, split, menu);

  const closeMenu = (): void => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutsidePointerDown);
  };

  const onOutsidePointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && !container.contains(event.target)) {
      closeMenu();
    }
  };

  const openMenu = (): void => {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutsidePointerDown);
    link.focus();
  };

  toggle.addEventListener("click", () => {
    if (menu.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });
  toggle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu();
    }
  });
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      toggle.focus();
    }
  });
  container.addEventListener("focusout", (event) => {
    if (!(event.relatedTarget instanceof Node) || !container.contains(event.relatedTarget)) {
      closeMenu();
    }
  });
  for (const action of [link, refresh]) {
    action.addEventListener("click", () => {
      closeMenu();
      toggle.focus();
    });
  }

  const setStatus = (nextLabel: string, state: ImdbArrButtonState, detail = nextLabel): void => {
    label.textContent = nextLabel;
    element.title = detail;
    element.disabled = state === "loading" || state === "success";
    element.setAttribute("aria-busy", String(state === "loading"));
    refresh.disabled = state === "loading";
    for (const action of [element, toggle]) {
      action.style.backgroundColor = buttonColorByState[state];
    }
  };

  setStatus(`Checking ${serviceName}…`, "loading");
  return {
    container,
    element,
    refresh,
    remove: () => {
      closeMenu();
      container.remove();
    },
    setStatus,
    setUrl: (url) => {
      link.href = url;
      toggle.hidden = false;
    },
  };
}

const buttonColorByState: Record<ImdbArrButtonState, string> = {
  default: "#0084ff",
  error: "#dc2626",
  loading: "#0084ff",
  success: "#16a34a",
};

const buttonStyles = `
.arr-imdb-control { position: relative; width: 100%; margin-block: 8px; font: 500 14px/1.4 Roboto, Helvetica, Arial, sans-serif; }
.arr-imdb-control [hidden] { display: none !important; }
.arr-imdb-control .arr-imdb-split { display: flex; width: 100%; border-radius: var(--ipt-buttonRadius, 4px); color: #fff; }
.arr-imdb-split > button { display: flex; align-items: center; min-height: 48px; border: 0; margin: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.arr-imdb-split > .arr-imdb-primary { flex: 1; min-width: 0; padding: 12px 16px; gap: 8px; text-align: left; }
.arr-imdb-primary img { flex-shrink: 0; }
.arr-imdb-primary .ipc-btn__text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arr-imdb-split > .arr-imdb-toggle { flex: 0 0 48px; justify-content: center; padding: 0; }
.arr-imdb-split > button:disabled { opacity: 1; cursor: default; }
.arr-imdb-split > button:enabled:hover { background: #ffffff18; }
.arr-imdb-control :is(button, a):focus-visible { outline: 2px solid #fff; outline-offset: -3px; }
.arr-imdb-menu { position: absolute; inset: calc(100% + 4px) 0 auto auto; z-index: 1000; width: max-content; min-width: 220px; max-width: 100%; padding: 4px; box-sizing: border-box; border: 1px solid #ffffff30; border-radius: 4px; background: #252525; color: #fff; box-shadow: 0 4px 16px #0008; }
.arr-imdb-menu > :is(a, button) { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 12px; border: 0; border-radius: 2px; background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; }
.arr-imdb-menu > :is(a, button):hover { background: #ffffff18; }
.arr-imdb-menu > button:disabled { opacity: .5; cursor: default; }
`;
