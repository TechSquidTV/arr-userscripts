export interface GmXmlHttpRequestDetails {
  readonly data?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly method?: string;
  readonly onerror?: (response: GmXmlHttpResponse) => void;
  readonly onload?: (response: GmXmlHttpResponse) => void;
  readonly ontimeout?: (response: GmXmlHttpResponse) => void;
  readonly responseType?: "json" | "text";
  readonly timeout?: number;
  readonly url: string;
}

export interface GmXmlHttpResponse {
  readonly responseText: string;
  readonly status: number;
  readonly statusText: string;
}

interface GmRequestController {
  abort(): void;
}

interface GmNamespace {
  deleteValue?(key: string): Promise<void> | void;
  getValue?(key: string, defaultValue: string): Promise<string> | string;
  registerMenuCommand?(caption: string, onClick: () => void): Promise<string> | string;
  setValue?(key: string, value: string): Promise<void> | void;
  xmlHttpRequest?(
    details: GmXmlHttpRequestDetails,
  ): GmRequestController | Promise<GmXmlHttpResponse>;
}

declare const GM: GmNamespace | undefined;
declare const GM_xmlhttpRequest:
  | ((details: GmXmlHttpRequestDetails) => GmRequestController)
  | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const GM_getValue: ((key: string, defaultValue: string) => string) | undefined;
declare const GM_registerMenuCommand: ((caption: string, onClick: () => void) => void) | undefined;
declare const GM_setValue: ((key: string, value: string) => void) | undefined;

export class GmRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GmRequestError";
  }
}

export function gmXmlHttpRequest(details: GmXmlHttpRequestDetails): Promise<GmXmlHttpResponse> {
  return new Promise((resolve, reject) => {
    const requestDetails: GmXmlHttpRequestDetails = {
      ...details,
      onerror: (response) => reject(createRequestError("The request failed.", response)),
      onload: resolve,
      ontimeout: (response) => reject(createRequestError("The request timed out.", response)),
    };

    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest(requestDetails);
      return;
    }

    if (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") {
      const request = GM.xmlHttpRequest(requestDetails);

      if (request instanceof Promise) {
        void request.then(resolve, reject);
      }

      return;
    }

    reject(
      new GmRequestError(
        "GM_xmlhttpRequest is unavailable. Install the script in a userscript manager that supports it.",
      ),
    );
  });
}

export async function gmDeleteValue(key: string): Promise<boolean> {
  try {
    if (typeof GM_deleteValue === "function") {
      GM_deleteValue(key);
      return true;
    }

    if (typeof GM !== "undefined" && typeof GM.deleteValue === "function") {
      await GM.deleteValue(key);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function gmGetValue(key: string): Promise<string | undefined> {
  if (typeof GM_getValue === "function") {
    return GM_getValue(key, "");
  }

  if (typeof GM !== "undefined" && typeof GM.getValue === "function") {
    return await GM.getValue(key, "");
  }

  return undefined;
}

export function gmRegisterMenuCommand(caption: string, onClick: () => void): boolean {
  try {
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand(caption, onClick);
      return true;
    }

    if (typeof GM !== "undefined" && typeof GM.registerMenuCommand === "function") {
      const registration = GM.registerMenuCommand(caption, onClick);

      if (registration instanceof Promise) {
        void registration.catch(() => undefined);
      }

      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function gmSetValue(key: string, value: string): Promise<boolean> {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return true;
    }

    if (typeof GM !== "undefined" && typeof GM.setValue === "function") {
      await GM.setValue(key, value);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function createRequestError(message: string, response: GmXmlHttpResponse): GmRequestError {
  return new GmRequestError(`${message} ${response.status} ${response.statusText}`.trim());
}
