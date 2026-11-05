import { ButtonLink, Container, DemoButton, GITHUB_URL, stagger } from "./ui";

export function Cta() {
  return (
    <section aria-labelledby="cta-title" className="cta-glow relative overflow-hidden py-24 sm:py-32">
      <Container className="relative flex flex-col items-center text-center">
        <h2 id="cta-title" style={stagger(0)} className="reveal text-title text-balance">
          Ask the docs something.
        </h2>
        <p style={stagger(1)} className="reveal text-lead mt-5 max-w-xl text-pretty text-ink-2">
          The live demo opens after deploy. Until then, the code, the eval suite and its results are being built in the
          open.
        </p>
        <div style={stagger(2)} className="reveal mt-9 flex flex-wrap items-start justify-center gap-3 [&>span]:items-center">
          <DemoButton id="cta-demo" />
          <ButtonLink href={GITHUB_URL} variant="secondary" external>
            Follow on GitHub
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
