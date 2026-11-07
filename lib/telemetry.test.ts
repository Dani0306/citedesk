import { describe, expect, it } from "vitest";
import { startTracing, tracingConfigured } from "@/lib/telemetry";

describe("tracing", () => {
  it("needs all three Langfuse variables", () => {
    expect(tracingConfigured({})).toBe(false);
    expect(tracingConfigured({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" })).toBe(false);
    expect(tracingConfigured({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com" })).toBe(true);
  });

  it("stays off without keys, and flushing is a harmless no-op", async () => {
    const t = startTracing({});
    expect(t.enabled).toBe(false);
    await expect(t.flush()).resolves.toBeUndefined();
  });

  it("keeps its state on globalThis, so every Next bundle shares one processor", () => {
    startTracing({});
    expect((globalThis as Record<symbol, unknown>)[Symbol.for("citedesk.tracing")]).toEqual({ processor: null });
    // A second call, as from another bundle, reuses it instead of starting again.
    expect(startTracing({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_BASE_URL: "https://x" }).enabled).toBe(false);
  });
});
