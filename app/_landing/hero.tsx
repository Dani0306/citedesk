import Image from "next/image";
import heroPages from "./hero-pages.webp";
import { SAMPLES } from "./sample-data";
import { Badge, ButtonLink, Container, DemoButton, LAB_STATUS, Marker, stagger } from "./ui";

export function SampleLabel() {
  return <p className="text-xs font-medium text-ink-2">Sample · scripted, not a live answer</p>;
}

// The preview plays once on load (.hero-seq / .hero-pop in globals.css): the question, then each
// sentence with its markers, then the sources. Without animation the whole answer is just there.
function AnswerPreview() {
  const sample = SAMPLES[0];
  return (
    <figure className="drift mt-14 max-w-220 rounded-3xl border border-line bg-card p-5 shadow-(--shadow) sm:mt-20 sm:p-8">
      <figcaption className="flex items-center justify-between gap-3">
        <SampleLabel />
        <Badge tone="accent">3 sources</Badge>
      </figcaption>
      <p
        style={stagger(0)}
        className="hero-seq mt-5 ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[0.9375rem]"
      >
        {sample.question}
      </p>
      <p className="mt-5 text-pretty leading-relaxed">
        {sample.answer.map((s, i) => (
          <span key={i} style={stagger(i + 1)} className="hero-seq">
            {s.text}
            {s.cites.map((n) => (
              <Marker key={n} n={n} className="hero-pop" style={stagger(i + 1)} />
            ))}{" "}
          </span>
        ))}
      </p>
      <ul style={stagger(sample.answer.length + 1)} className="hero-seq mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
        {sample.sources.map((s) => (
          <li key={s.n} className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 font-mono text-xs text-ink-2">
            <span className="text-accent">{s.n}</span>
            {s.headingPath.join(" › ")}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pt-16 pb-20 sm:pt-24 sm:pb-28">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="max-w-3xl">
            <Badge>{LAB_STATUS}</Badge>
            <h1 id="hero-title" className="text-display mt-6 text-balance">
              Answers you can check.
            </h1>
            <p className="text-lead mt-6 max-w-2xl text-pretty text-ink-2">
              CiteDesk answers questions only from your documentation, cites the exact passage behind every sentence,
              and says “I don’t know” when the docs don’t cover it.
            </p>
            <div className="mt-9 flex flex-wrap items-start gap-3">
              <DemoButton />
              <ButtonLink href="#evidence" variant="secondary">
                See the evidence
              </ButtonLink>
            </div>
          </div>
          {/* Decorative art (generated with GPT Image 2.6, transparent, so one file serves light and dark).
              Large screens only: hidden below lg, and lazy, so phones never download it. The coded
              answer preview below stays the real demonstration. */}
          <div style={stagger(1)} className="hero-seq hidden lg:block">
            <Image src={heroPages} alt="" sizes="(min-width: 1024px) 500px, 1px" className="h-auto w-full" />
          </div>
        </div>
        <AnswerPreview />
      </Container>
    </section>
  );
}
