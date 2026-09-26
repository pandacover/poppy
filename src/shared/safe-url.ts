/**
 * Only http(s) result URLs may be opened. javascript:, file:, data:, and
 * other schemes are rejected before any in-app navigation.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function resultOpenError(
  result: { url: string } | undefined,
  resultCount: number,
): string | null {
  if (!result) {
    return `Say a number from 1 to ${resultCount || 5}.`;
  }
  if (!isSafeHttpUrl(result.url)) {
    return "That result has an unsafe URL.";
  }
  return null;
}

