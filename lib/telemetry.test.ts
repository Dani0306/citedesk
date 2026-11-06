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
});
