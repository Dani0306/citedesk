import { Logo } from "./nav";
import { Badge, Container, GITHUB_URL, PORTFOLIO_URL } from "./ui";

const link = "rounded-sm underline decoration-line underline-offset-4 hover:text-ink hover:decoration-current";

export function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="flex flex-col gap-6 py-10 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <p>
            CiteDesk, built by{" "}
            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className={link}>
              Daniel Colorado
            </a>
            .
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <li>
            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className={link}>
              danielcolorado.dev
            </a>
          </li>
          <li>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={link}>
              GitHub
            </a>
          </li>
          <li>Source docs: not ingested yet</li>
          <li>
            <Badge>In the lab</Badge>
          </li>
        </ul>
      </Container>
    </footer>
  );
}
