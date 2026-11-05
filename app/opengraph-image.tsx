import { ImageResponse } from "next/og";

// Built once at build time. Flexbox only (Satori has no grid), the bundled default font, and no
// file reads, so the 500 KB limit is not a concern. Words only: no numbers, no mock UI.
export const alt = "CiteDesk: answers you can check";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#0071e3";

function Chip({ n }: { n: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 52,
        height: 52,
        borderRadius: 14,
        background: "rgba(0, 113, 227, 0.12)",
        color: ACCENT,
        fontSize: 30,
        fontWeight: 600,
      }}
    >
      {n}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#ffffff",
          color: "#1d1d1f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="1" width="22" height="22" rx="7" fill={ACCENT} opacity="0.14" />
            <path
              d="M9 7H7v10h2M15 7h2v10h-2"
              stroke={ACCENT}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="1.6" fill={ACCENT} />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>CiteDesk</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.04, letterSpacing: -3 }}>
            Answers you can check.
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 34, lineHeight: 1.35, color: "#6e6e73", maxWidth: 940 }}>
            Cites the exact passage behind every sentence, and says “I don’t know” when the docs don’t cover it.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Chip n={1} />
            <Chip n={2} />
            <Chip n={3} />
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              border: "2px solid rgba(0, 0, 0, 0.12)",
              borderRadius: 999,
              fontSize: 26,
              color: "#6e6e73",
            }}
          >
            In the lab · not deployed yet
          </div>
        </div>
      </div>
    ),
    size,
  );
}
