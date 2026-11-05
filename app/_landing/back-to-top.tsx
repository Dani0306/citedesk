/**
 * A plain link to the top. It fades in after the first screen through a scroll timeline
 * (see `.to-top` in globals.css); `visibility` keeps it out of the tab order while hidden.
 * Where scroll timelines aren't supported it isn't rendered visible at all: it's a convenience.
 */
export function BackToTop() {
  return (
    <a
      href="#top"
      aria-label="Back to top"
      className="to-top press glass fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 size-11 items-center justify-center rounded-full border border-line text-ink shadow-(--shadow)"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="size-5" fill="none">
        <path d="M10 16V4M4.5 9.5L10 4l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
