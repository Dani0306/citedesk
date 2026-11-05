import type { ReactNode } from "react";

// Decorative art and icons. All inline SVG on `currentColor` / theme tokens, so light, dark and
// high-contrast need no separate files. Icons share one 24 px grid and a 1.6 stroke.

function Icon({ children, className = "size-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconSupport() {
  return (
    <Icon>
      <path d="M20 12c0 3.9-3.6 7-8 7-1.1 0-2.2-.2-3.1-.5L4.5 20l1.2-3.4C4.6 15.5 4 13.8 4 12c0-3.9 3.6-7 8-7s8 3.1 8 7z" />
      <path d="M9 12h.01M12 12h.01M15 12h.01" strokeWidth="2.2" />
    </Icon>
  );
}

export function IconLearn() {
  return (
    <Icon>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
    </Icon>
  );
}

export function IconDocs() {
  return (
    <Icon>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5.5l-3 13" />
    </Icon>
  );
}

export function IconCitation() {
  return (
    <Icon>
      <path d="M9 6H7v12h2M15 6h2v12h-2" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconRefusal() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7" />
    </Icon>
  );
}

export function IconCost() {
  return (
    <Icon>
      <path d="M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20z" />
      <path d="M10 9h4M10 13h4" />
    </Icon>
  );
}

export function IconGate() {
  return (
    <Icon>
      <path d="M12 3.5l7 2.5v5.5c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V6z" />
      <path d="M9 12l2.3 2.3L15.5 10" />
    </Icon>
  );
}

/** Check mark that draws itself on scroll (`.draw-icon`); `pathLength` lets one dash value fit any size. */
export function CheckIcon({ className = "mt-1 size-5 shrink-0 text-accent" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`draw-icon ${className}`} fill="none">
      <path
        pathLength={1}
        d="M4.5 10.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A tile that gives an icon a quiet place to sit. */
export function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
      {children}
    </span>
  );
}

/** Spot art: a search that finds no page. */
export function SearchMissArt() {
  return (
    <svg aria-hidden viewBox="0 0 96 64" className="h-16 w-24 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="6" width="44" height="52" rx="7" fill="var(--surface)" />
      <path d="M19 18h26M19 26h20M19 34h24M19 42h14" opacity="0.55" />
      <circle cx="64" cy="34" r="12" fill="var(--card)" />
      <path d="M73 43l9 9" strokeWidth="2.4" />
      <path d="M60 30l8 8M68 30l-8 8" stroke="var(--accent)" />
    </svg>
  );
}

/** Spot art: a fluent answer with nothing behind it. */
export function NoSourceArt() {
  return (
    <svg aria-hidden viewBox="0 0 96 64" className="h-16 w-24 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 12a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H34l-10 9v-9h-4a6 6 0 0 1-6-6z" fill="var(--surface)" />
      <path d="M24 17h32M24 25h22" opacity="0.55" />
      <rect x="54" y="40" width="30" height="16" rx="5" strokeDasharray="3 3.5" fill="var(--card)" />
      <path d="M62 48h14" opacity="0.55" />
    </svg>
  );
}
