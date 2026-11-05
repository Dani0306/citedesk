// Scripted content for the landing page demos. Fictional docs ("Acme Cloud") so no real
// product is misrepresented; every visual that uses it is labelled as a sample. It follows
// the product's own rule: each answer sentence cites a source that contains the claim.

export type Source = {
  n: number;
  title: string;
  headingPath: string[];
  anchor: string;
  passage: { before?: string; cited: string; after?: string };
};

export type AnswerSentence = { text: string; cites: number[] };

export const SAMPLE_QUESTION = "How long do API keys stay valid, and can I rotate one without downtime?";

export const SAMPLE_ANSWER: AnswerSentence[] = [
  {
    text: "API keys stay valid for 90 days after they're created, and the dashboard warns you 14 days before one expires.",
    cites: [1],
  },
  {
    text: "You can rotate without downtime: create a second key, deploy it, then revoke the first, because both keys work until one is revoked.",
    cites: [2],
  },
  {
    text: "A revoked key stops working everywhere within 60 seconds.",
    cites: [3],
  },
];

export const SAMPLE_SOURCES: Source[] = [
  {
    n: 1,
    title: "API keys",
    headingPath: ["Security", "API keys", "Expiry"],
    anchor: "#expiry",
    passage: {
      before: "Each project can hold up to five active keys.",
      cited:
        "Keys expire 90 days after they are created. Fourteen days before expiry, the dashboard shows a warning on the Keys page.",
      after: "Expired keys are kept for audit for one year.",
    },
  },
  {
    n: 2,
    title: "API keys",
    headingPath: ["Security", "API keys", "Rotating a key"],
    anchor: "#rotating-a-key",
    passage: {
      cited:
        "To rotate without downtime, create a second key, deploy it to your services, and then revoke the first. Both keys are accepted until one is revoked.",
      after: "Rotation does not change a key's permissions.",
    },
  },
  {
    n: 3,
    title: "API keys",
    headingPath: ["Security", "API keys", "Revoking a key"],
    anchor: "#revoking-a-key",
    passage: {
      cited: "Revocation propagates to every region within 60 seconds.",
      after: "Requests signed with a revoked key return 401.",
    },
  },
];

export const SAMPLE_REFUSAL = {
  question: "Is there a discount for nonprofits?",
  closest: { headingPath: ["Billing", "Plans and pricing"] },
};
