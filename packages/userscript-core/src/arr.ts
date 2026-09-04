import { parseHttpUrl, requireEnvironmentValue } from "./environment.ts";
import { gmXmlHttpRequest } from "./gm.ts";

export interface ArrConnectionConfig {
  readonly apiKey: string;
  readonly url: string;
}

export interface ArrConnectionOptions {
  readonly apiKeyValue: string | undefined;
  readonly apiKeyVariable: string;
  readonly serviceName: string;
  readonly urlValue: string | undefined;
  readonly urlVariable: string;
}

export type ArrJsonPrimitive = boolean | null | number | string;
export type ArrJsonValue = ArrJsonArray | ArrJsonObject | ArrJsonPrimitive;

export interface ArrJsonArray extends ReadonlyArray<ArrJsonValue> {}

export interface ArrJsonObject {
  readonly [key: string]: ArrJsonValue;
}

export class ArrApiClient {
  private readonly lookupRequests = new Map<string, Promise<ArrJsonObject>>();

  public constructor(
    protected readonly connection: ArrConnectionConfig,
    private readonly createNotFoundError: () => Error,
    private readonly lookupPath: string,
  ) {}

  protected async lookupEntry(term: string): Promise<ArrJsonObject> {
    const cachedRequest = this.lookupRequests.get(term);

    if (cachedRequest !== undefined) {
      return cachedRequest;
    }

    const request = this.requestLookup(term);
    this.lookupRequests.set(term, request);
    void request.catch(() => {
      this.lookupRequests.delete(term);
    });

    return request;
  }

  protected async requestJson(
    path: string,
    request: { readonly body?: string; readonly method?: "POST" } = {},
  ): Promise<ArrJsonValue> {
    const response = await gmXmlHttpRequest({
      ...(request.body === undefined ? {} : { data: request.body }),
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.connection.apiKey,
      },
      method: request.method ?? "GET",
      responseType: "text",
      timeout: 15_000,
      url: `${this.connection.url}${path}`,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `${this.connection.url} returned ${response.status} ${response.statusText}.`.trim(),
      );
    }

    return JSON.parse(response.responseText) as ArrJsonValue;
  }

  private async requestLookup(term: string): Promise<ArrJsonObject> {
    const lookupResults = await this.requestJson(
      `${this.lookupPath}?term=${encodeURIComponent(term)}`,
    );

    if (
      !Array.isArray(lookupResults) ||
      lookupResults.length === 0 ||
      !isArrJsonObject(lookupResults[0])
    ) {
      throw this.createNotFoundError();
    }

    return lookupResults[0];
  }
}

export function getArrConnectionConfig(options: ArrConnectionOptions): ArrConnectionConfig | Error {
  try {
    return {
      apiKey: requireEnvironmentValue(options.apiKeyValue, options.apiKeyVariable),
      url: parseHttpUrl(options.urlValue, options.urlVariable),
    };
  } catch (error) {
    return error instanceof Error
      ? error
      : new Error(`Unable to read ${options.serviceName} configuration.`);
  }
}

export function isArrJsonObject(value: ArrJsonValue | undefined): value is ArrJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
