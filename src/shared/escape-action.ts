import type { AppPhase } from "./types";

export type EscapeAction = "back-to-results" | "minimize";

/**
 * Esc on an in-app page returns to the results list first.
 * Esc on idle, results, or any other launcher phase minimizes the window.
 */
export function escapeAction(phase: AppPhase | null | undefined): EscapeAction {
  if (phase === "page" || phase === "opening") {
    return "back-to-results";
  }
  return "minimize";
}
