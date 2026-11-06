import { isDefaultExportSpan, LangfuseSpanProcessor } from "@langfuse/otel";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { registerTelemetry } from "ai";

// Langfuse tracing (T39), the AI SDK 7 path: an OTel tracer provider with Langfuse's span processor,
// plus Langfuse's AI SDK integration registered once. Off unless all three LANGFUSE_* variables are
// set (.env.example promises that). Traces are for looking at what the model saw and said;
// every number we report still comes from model_calls.

type Env = Record<string, string | undefined>;

export function tracingConfigured(env: Env = process.env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL);
}

const TRACER = "citedesk";

let processor: LangfuseSpanProcessor | null | undefined;

/** Starts tracing once per process (a no-op without keys) and returns a flush for short-lived runs. */
export function startTracing(env: Env = process.env): { enabled: boolean; flush: () => Promise<void> } {
  if (processor === undefined) {
    if (!tracingConfigured(env)) {
      processor = null;
    } else {
      processor = new LangfuseSpanProcessor({
        environment: env.VERCEL_ENV ?? "local",
        // Langfuse's default filter keeps AI SDK spans; add ours, so each question is one trace.
        shouldExportSpan: ({ otelSpan }) => isDefaultExportSpan(otelSpan) || otelSpan.instrumentationScope.name === TRACER,
      });
      new NodeTracerProvider({ spanProcessors: [processor] }).register();
      registerTelemetry(new LangfuseVercelAiSdkIntegration());
    }
  }
  const active = processor;
  return { enabled: active !== null, flush: async () => (active ? active.forceFlush() : undefined) };
}

/**
 * Runs one question inside a parent span, so its embedding, rerank and answer calls land in one
 * Langfuse trace named `name`. Without tracing it costs nothing: the global tracer is a no-op.
 */
export function traced<T>(name: string, attributes: Record<string, string | number | boolean>, run: () => Promise<T>): Promise<T> {
  return trace.getTracer(TRACER).startActiveSpan(name, { attributes: { "langfuse.trace.name": name, ...attributes } }, async (span) => {
    try {
      return await run();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}
