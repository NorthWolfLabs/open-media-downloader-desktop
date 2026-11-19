// Startup failures from the native shell (v2_bootstrap_engine). The shell sends
// { message, retryable, newer_version, log }: the message's first line is for
// people, any further lines are diagnostics for Technical details. Errors from
// anywhere else (a lost connection, the browser preview) are plain text and
// can be retried.
export type StartupFailure = {
  summary: string;
  detail: string;
  /** False when trying again cannot help (reinstall or a newer OMD is needed). */
  retryable: boolean;
  /** A newer OMD already uses this data; offer the latest release. */
  newerVersion: boolean;
  /** The native shell can reveal its startup log file. */
  log: boolean;
};

export function startupFailure(error: unknown): StartupFailure {
  const native =
    error && typeof error === "object" && !(error instanceof Error) && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string; retryable?: unknown; newer_version?: unknown; log?: unknown })
      : null;
  const message = native
    ? native.message
    : error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "OMD could not start.";
  const [summary = "", ...rest] = message.split("\n");
  return {
    summary: summary.trim() || "OMD could not start.",
    detail: rest.join("\n").trim(),
    retryable: native ? native.retryable !== false : true,
    newerVersion: native?.newer_version === true,
    log: native?.log === true,
  };
}

/** App dispatches this on window once its startup screen has a result: connected,
 * or showing its own startup failure. main.ts stops treating errors as fatal then. */
export const STARTUP_SETTLED = "omd-startup-settled";
