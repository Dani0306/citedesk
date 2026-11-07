import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export const GITHUB_URL = "https://github.com/Dani0306";
export const PORTFOLIO_URL = "https://danielcolorado.dev";

/** Accurate today: query_log stores the question text, Langfuse traces carry it, and the app sets no cookies. */
export const LOGGING_NOTICE =
  "Questions are stored to measure and debug this demo, and sent to a tracing service (Langfuse). No account, no tracking cookies. Please don't enter personal or company data.";

/** One place for the project's status line, so the hero badge can't drift from reality. Becomes "Live" at T46. */
export const LAB_STATUS = "In the lab · demo live";

/** Position of an item in a staggered group; globals.css shifts the item's scroll range by it. */
export function stagger(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-270 px-4 sm:px-6 ${className}`}>{children}</div>;
}

type SectionProps = {
  id: string;
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  tone?: "plain" | "surface";
  children: ReactNode;
};

export function Section({ id, eyebrow, title, intro, tone = "plain", children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`py-20 sm:py-28 ${tone === "surface" ? "bg-surface" : ""}`}
    >
      <Container>
        <header className="reveal max-w-2xl">
          <p className="text-eyebrow text-accent">{eyebrow}</p>
          <h2 id={`${id}-title`} className="text-title mt-3 text-balance">
            {title}
          </h2>
          {intro ? <p className="text-lead mt-5 text-ink-2 text-pretty">{intro}</p> : null}
        </header>
        <div className="mt-12 sm:mt-16">{children}</div>
      </Container>
    </section>
  );
}

const base =
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.9375rem] font-medium";
const variants = {
  primary: "bg-accent-strong text-white hover:bg-accent-hover",
  secondary: "border border-line text-ink hover:bg-surface",
};

type Variant = keyof typeof variants;

export function ButtonLink({
  href,
  variant = "primary",
  external = false,
  children,
}: {
  href: string;
  variant?: Variant;
  external?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={`${base} ${variants[variant]}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

export function DemoButton({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <Link href="/demo" className={`${base} ${variants.primary} ${size === "small" ? "min-h-9 px-4 text-sm" : ""}`}>
      Try the demo
    </Link>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        tone === "accent" ? "border-accent/30 bg-accent-soft text-accent" : "border-line text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}

/** Inline citation marker for static (non-interactive) previews. */
export function Marker({ n, className = "", style }: { n: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      style={style}
      className={`${className} ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-accent-soft px-1 align-[0.1em] font-mono text-[0.75rem] font-medium text-accent`}
    >
      {n}
    </span>
  );
}
