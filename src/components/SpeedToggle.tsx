export function SpeedToggle({
  isHikari,
  onChange,
}: {
  isHikari: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-border bg-bg-soft p-1">
      <button
        onClick={() => onChange(true)}
        className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-2 text-xs font-medium transition ${
          isHikari
            ? "bg-card text-text shadow-[0_0_0_1px_var(--color-accent-2)_inset]"
            : "text-text-dim hover:text-text"
        }`}
      >
        <span
          className={
            isHikari
              ? "font-mono text-[11px] tracking-wider uppercase text-accent-2"
              : "font-mono text-[11px] tracking-wider uppercase"
          }
        >
          Hikari
        </span>
        <span className="font-mono text-[10px] text-text-faint">~20ms</span>
      </button>
      <button
        onClick={() => onChange(false)}
        className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-2 text-xs font-medium transition ${
          !isHikari
            ? "bg-card text-text shadow-[0_0_0_1px_var(--color-text-dim)_inset]"
            : "text-text-dim hover:text-text"
        }`}
      >
        <span className="font-mono text-[11px] tracking-wider uppercase">
          RPC poll
        </span>
        <span className="font-mono text-[10px] text-text-faint">~400ms</span>
      </button>
    </div>
  );
}
