import { useEffect, useState } from "react";

type Props = {
  /** How long the splash stays at full opacity before fading. */
  holdMs?: number;
  /** Length of the opacity transition. */
  fadeMs?: number;
};

export function SplashOverlay({ holdMs = 5000, fadeMs = 600 }: Props) {
  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");

  useEffect(() => {
    const fadeAt = setTimeout(() => setPhase("fading"), holdMs);
    const goneAt = setTimeout(() => setPhase("gone"), holdMs + fadeMs);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(goneAt);
    };
  }, [holdMs, fadeMs]);

  if (phase === "gone") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
      style={{
        opacity: phase === "fading" ? 0 : 1,
        pointerEvents: phase === "fading" ? "none" : "auto",
        transition: `opacity ${fadeMs}ms ease-out`,
      }}
      aria-hidden={phase === "fading"}
    >
      <img
        src="/grid-loader.svg"
        alt=""
        width={60}
        height={60}
        style={{ display: "block" }}
      />
    </div>
  );
}
