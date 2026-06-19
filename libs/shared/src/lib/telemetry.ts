/**
 * Minimal, swappable telemetry. The default sink is a no-op (it does NOT
 * console.log), so importing this never adds noise. Apps install a real sink
 * (Cloud Logging, console, a test spy, …) via {@link setTelemetrySink}.
 */

/** A telemetry sink: receives a named event with optional structured fields. */
export type TelemetrySink = (name: string, fields?: Record<string, unknown>) => void;

const noopSink: TelemetrySink = () => {
  /* no-op by default */
};

let currentSink: TelemetrySink = noopSink;

/** Installs the active telemetry sink. Pass nothing to reset to the no-op. */
export function setTelemetrySink(sink?: TelemetrySink): void {
  currentSink = sink ?? noopSink;
}

/** Emits a telemetry event through the active sink. Never throws. */
export function emit(name: string, fields?: Record<string, unknown>): void {
  try {
    currentSink(name, fields);
  } catch {
    // Telemetry must never break the calling code path.
  }
}
