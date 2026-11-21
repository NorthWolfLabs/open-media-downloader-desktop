import { EngineError } from "./client";

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

/** The engine refused a new window because it is already stopping (503 engine_stopping),
 * for example when OMD opens just as an idle engine shuts down. It exits within seconds;
 * starting again then launches a fresh engine. */
export function engineStopping(error: unknown): boolean {
  return (
    error instanceof EngineError &&
    error.status === 503 &&
    error.problem?.code === "engine_stopping"
  );
}

/** Runs `start` (find or launch the engine, then attach), waiting and starting again
 * while the engine reports that it is stopping. Other failures are thrown at once. */
export async function startWhileEngineStops<T>(
  start: () => Promise<T>,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 10,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await start();
    } catch (error) {
      if (!engineStopping(error) || attempt >= attempts) throw error;
      await wait(Math.min(500 * attempt, 3000));
    }
  }
}
