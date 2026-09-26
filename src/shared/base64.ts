/**
 * Encode raw bytes as base64. Implemented with `btoa` so the same helper
 * works in the renderer bundle and in Node tests (Node 20+ provides btoa).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ByteLength(data: string): number {
  const trimmed = data.trim();
  if (!trimmed) {
    return 0;
  }
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}
