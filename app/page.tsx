import { Audience } from "./_landing/audience";
import { BackToTop } from "./_landing/back-to-top";
import { CitationDemo } from "./_landing/citation-demo";
import { Cta } from "./_landing/cta";
import { Evidence } from "./_landing/evidence";
import { Faq } from "./_landing/faq";
import { Footer } from "./_landing/footer";
import { Hero } from "./_landing/hero";
import { HowItWorks } from "./_landing/how-it-works";
import { Nav } from "./_landing/nav";
import { Problem } from "./_landing/problem";
import { RefusalDemo } from "./_landing/refusal-demo";
import { Trust } from "./_landing/trust";
import { Section } from "./_landing/ui";

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-60 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:shadow-(--shadow)"
      >
        Skip to content
      </a>
      <div id="top" />
      <Nav />
      <main id="main">
        <Hero />
        <Problem />
        <Section
          id="citations"
          tone="surface"
          eyebrow="See it cite"
          title="Every sentence points at its source."
          intro="Select a citation and the passage it came from lights up. In the real app, code checks that every marker points at a passage retrieved for that question."
        >
          <CitationDemo />
        </Section>
        <RefusalDemo />
        <HowItWorks />
        <Evidence />
        <Audience />
        <Trust />
        <Faq />
        <Cta />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
