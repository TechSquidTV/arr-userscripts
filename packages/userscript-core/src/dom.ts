export interface WaitForElementOptions {
  readonly root?: ParentNode;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export function waitForElement<ElementType extends Element>(
  selector: string,
  options: WaitForElementOptions = {},
): Promise<ElementType> {
  const root = options.root ?? document;
  const existingElement = root.querySelector<ElementType>(selector);

  if (existingElement !== null) {
    return Promise.resolve(existingElement);
  }

  return new Promise((resolve, reject) => {
    let timeoutId: number | undefined;
    const observer = new MutationObserver(() => {
      const element = root.querySelector<ElementType>(selector);

      if (element !== null) {
        finish(() => resolve(element));
      }
    });

    const finish = (callback: () => void): void => {
      observer.disconnect();

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      options.signal?.removeEventListener("abort", abort);
      callback();
    };

    const abort = (): void =>
      finish(() => reject(new DOMException("The wait was aborted.", "AbortError")));

    if (options.signal?.aborted === true) {
      abort();
      return;
    }

    observer.observe(document.documentElement, { childList: true, subtree: true });
    options.signal?.addEventListener("abort", abort, { once: true });

    if (options.timeoutMs !== undefined) {
      timeoutId = window.setTimeout(
        () => finish(() => reject(new Error(`Timed out waiting for ${selector}.`))),
        options.timeoutMs,
      );
    }
  });
}
