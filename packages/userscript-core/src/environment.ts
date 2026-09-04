export function requireEnvironmentValue(value: string | undefined, name: string): string {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    throw new Error(`Missing required configuration value: ${name}`);
  }

  return normalizedValue;
}

export function optionalEnvironmentValue(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue === undefined || normalizedValue.length === 0
    ? undefined
    : normalizedValue;
}

export function parseBoolean(
  value: string | undefined,
  name: string,
  defaultValue: boolean,
): boolean {
  const normalizedValue = optionalEnvironmentValue(value);

  if (normalizedValue === undefined) {
    return defaultValue;
  }

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new Error(`${name} must be either "true" or "false".`);
}

export function parsePositiveInteger(value: string | undefined, name: string): number {
  const normalizedValue = requireEnvironmentValue(value, name);
  const parsedValue = Number(normalizedValue);

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
}

export function parseHttpUrl(value: string | undefined, name: string): string {
  const normalizedValue = requireEnvironmentValue(value, name);
  const parsedUrl = new URL(normalizedValue);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`${name} must use an http or https URL.`);
  }

  return normalizedValue.replace(/\/+$/, "");
}
