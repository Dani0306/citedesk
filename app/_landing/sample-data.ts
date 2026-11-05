// Scripted content for the landing page demos. Fictional docs ("Acme Cloud") so no real
// product is misrepresented; every visual that uses it is labelled as a sample. It follows
// the product's own rule: each answer sentence cites a source that contains the claim.

export type Source = {
  n: number;
  title: string;
  headingPath: string[];
  /** Page the section lives on, without a scheme, e.g. `acme.example/docs/security/api-keys`. */
  page: string;
  anchor: string;
  passage: { before?: string; cited: string; after?: string };
};

export type AnswerSentence = { text: string; cites: number[] };

export type Sample = {
  id: string;
  /** Short chip label. */
  label: string;
  question: string;
  answer: AnswerSentence[];
  sources: Source[];
};

export const SAMPLES: Sample[] = [
  {
    id: "api-keys",
    label: "API key expiry",
    question: "How long do API keys stay valid, and can I rotate one without downtime?",
    answer: [
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
    ],
    sources: [
      {
        n: 1,
        title: "API keys",
        headingPath: ["Security", "API keys", "Expiry"],
        page: "acme.example/docs/security/api-keys",
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
        page: "acme.example/docs/security/api-keys",
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
        page: "acme.example/docs/security/api-keys",
        anchor: "#revoking-a-key",
        passage: {
          cited: "Revocation propagates to every region within 60 seconds.",
          after: "Requests signed with a revoked key return 401.",
        },
      },
    ],
  },
  {
    id: "webhooks",
    label: "Webhook retries",
    question: "What happens if my webhook endpoint is down, and how do I check a request really came from Acme?",
    answer: [
      {
        text: "If your endpoint doesn't return a 2xx response within 10 seconds, Acme retries the delivery up to eight times over 24 hours.",
        cites: [1],
      },
      {
        text: "To verify a request, compute an HMAC-SHA256 of the raw body with your signing secret and compare it with the Acme-Signature header in constant time.",
        cites: [2],
      },
      {
        text: "Events that still failed can be replayed from the dashboard for 30 days.",
        cites: [3],
      },
    ],
    sources: [
      {
        n: 1,
        title: "Webhook delivery",
        headingPath: ["Webhooks", "Delivery", "Retries"],
        page: "acme.example/docs/webhooks/delivery",
        anchor: "#retries",
        passage: {
          before: "Each event is delivered at least once.",
          cited:
            "If your endpoint does not return a 2xx response within 10 seconds, Acme retries the delivery up to eight times over 24 hours, with the gap between attempts growing each time.",
          after: "Retries stop as soon as any attempt returns a 2xx response.",
        },
      },
      {
        n: 2,
        title: "Webhook delivery",
        headingPath: ["Webhooks", "Delivery", "Verifying signatures"],
        page: "acme.example/docs/webhooks/delivery",
        anchor: "#verifying-signatures",
        passage: {
          cited:
            "Every request carries an Acme-Signature header containing an HMAC-SHA256 of the raw body, computed with your endpoint's signing secret. Compare it in constant time before trusting the payload.",
          after: "Reject requests whose timestamp is more than five minutes old.",
        },
      },
      {
        n: 3,
        title: "Webhook delivery",
        headingPath: ["Webhooks", "Delivery", "Replaying events"],
        page: "acme.example/docs/webhooks/delivery",
        anchor: "#replaying-events",
        passage: {
          before: "Replays reuse the original event ID, so handlers should be idempotent.",
          cited: "Failed events can be replayed from the dashboard for 30 days after they were created.",
        },
      },
    ],
  },
  {
    id: "projects",
    label: "Deleting a project",
    question: "Who is allowed to delete a project, and can it be undone?",
    answer: [
      {
        text: "Owners and Admins can delete a project; Developers and Viewers can't.",
        cites: [1],
      },
      {
        text: "Deleting a project removes its API keys, webhooks and logs immediately.",
        cites: [2],
      },
      {
        text: "An Owner can restore a deleted project within 14 days.",
        cites: [3],
      },
    ],
    sources: [
      {
        n: 1,
        title: "Roles",
        headingPath: ["Teams", "Roles", "Owner and Admin"],
        page: "acme.example/docs/teams/roles",
        anchor: "#owner-and-admin",
        passage: {
          before: "Roles apply to every project in a team.",
          cited: "Owners and Admins can delete a project. Developers and Viewers cannot.",
          after: "Only Owners can change another member's role.",
        },
      },
      {
        n: 2,
        title: "Projects",
        headingPath: ["Teams", "Projects", "Deleting a project"],
        page: "acme.example/docs/teams/projects",
        anchor: "#deleting-a-project",
        passage: {
          cited: "Deleting a project removes its API keys, webhooks and logs immediately.",
          after: "Billing for the project stops at the end of the day.",
        },
      },
      {
        n: 3,
        title: "Projects",
        headingPath: ["Teams", "Projects", "Restoring a project"],
        page: "acme.example/docs/teams/projects",
        anchor: "#restoring-a-project",
        passage: {
          cited:
            "A deleted project is kept for 14 days. During that time an Owner can restore it from Settings › Deleted projects.",
        },
      },
    ],
  },
];

export const SAMPLE_REFUSAL = {
  question: "Is there a discount for nonprofits?",
  closest: { headingPath: ["Billing", "Plans and pricing"] },
};
