// Next.js calls register() once per server instance. Tracing (T39) is Node-only and off without the
// LANGFUSE_* variables; the chat route flushes its spans with after().
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTracing } = await import("./lib/telemetry");
    startTracing();
  }
}
