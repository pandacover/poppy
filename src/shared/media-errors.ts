import { CAPTURE_ERROR } from "./capture-errors";

export type MediaErrorKind = "denied" | "unavailable" | "notfound" | "failed";

export function mediaErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return "";
}

export function classifyGetUserMediaError(error: unknown): {
  kind: MediaErrorKind;
  message: string;
} {
  const name = mediaErrorName(error);
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return { kind: "denied", message: CAPTURE_ERROR.permissionDenied };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return { kind: "notfound", message: CAPTURE_ERROR.noMicrophone };
  }
  if (
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "OverconstrainedError" ||
    name === "AbortError" ||
    name === "SecurityError" ||
    name === "NotSupportedError"
  ) {
    return { kind: "unavailable", message: CAPTURE_ERROR.permissionUnavailable };
  }
  return { kind: "failed", message: CAPTURE_ERROR.captureFailed };
}
