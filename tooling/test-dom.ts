export function simulateTrustedClick(element: HTMLElement): void {
  // Happy DOM cannot generate hardware events. Exercise the trusted handler
  // path separately from ordinary, untrusted click() and dispatchEvent() calls.
  const event = new MouseEvent("click", { bubbles: true });
  Object.defineProperty(event, "isTrusted", { value: true });
  element.dispatchEvent(event);
}
