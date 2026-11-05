import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ANSWER_MODEL,
  DEFAULT_ESCALATION_MODEL,
  answerModel,
  escalationModel,
} from "@/lib/models";

describe("models", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the defaults when the environment is empty", () => {
    vi.stubEnv("CITEDESK_ANSWER_MODEL", "");
    vi.stubEnv("CITEDESK_ESCALATION_MODEL", "");
    expect(answerModel()).toBe(DEFAULT_ANSWER_MODEL);
    expect(escalationModel()).toBe(DEFAULT_ESCALATION_MODEL);
  });

  it("lets the environment override both models", () => {
    vi.stubEnv("CITEDESK_ANSWER_MODEL", "gpt-6.1-terra");
    vi.stubEnv("CITEDESK_ESCALATION_MODEL", "gpt-6-astra");
    expect(answerModel()).toBe("gpt-6.1-terra");
    expect(escalationModel()).toBe("gpt-6-astra");
  });
});
