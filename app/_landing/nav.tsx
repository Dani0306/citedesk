import { Container, DemoButton, GITHUB_URL } from "./ui";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#evidence", label: "Evidence" },
  { href: "#faq", label: "FAQ" },
];

export function Logo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6 text-accent" fill="none">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="currentColor" opacity="0.14" />
      <path d="M9 7H7v10h2M15 7h2v10h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Nav() {
  return (
    <header className="nav-edge glass sticky top-0 z-50">
      <Container className="flex h-14 items-center justify-between gap-3">
        <a href="#top" className="press -ml-1 flex items-center gap-2 rounded-lg px-1 py-1 font-semibold tracking-[-0.01em]">
          <Logo />
          CiteDesk
        </a>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <ul className="hidden items-center md:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="press rounded-full px-3 py-2 text-sm text-ink-2 hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press rounded-full px-3 py-2 text-sm text-ink-2 hover:text-ink"
          >
            GitHub
          </a>
          <DemoButton size="small" />
        </nav>
      </Container>
      {/* Reading progress; only shown where scroll timelines are supported. */}
      <div aria-hidden className="progress-line absolute inset-x-0 bottom-0 h-0.5 bg-accent-strong" />
    </header>
  );
}
