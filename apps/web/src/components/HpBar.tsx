import { clsx } from "clsx";

export default function HpBar({ hp, label, align = "left", flash }: { hp: number; label: string; align?: "left" | "right"; flash?: boolean }) {
  const color = hp > 60 ? "from-emerald-400 to-emerald-500" : hp > 30 ? "from-amber-300 to-amber-500" : "from-rose-400 to-rose-600";
  return (
    <div className={clsx("w-full", align === "right" && "text-right")}>
      <div className={clsx("mb-1 flex items-baseline justify-between text-xs font-bold tracking-wider text-gray-400 uppercase", align === "right" && "flex-row-reverse")}>
        <span>{label}</span>
        <span className="font-mono text-base text-white tabular-nums" data-testid={`hp-${label.toLowerCase()}`}>
          {Math.round(hp)} HP
        </span>
      </div>
      <div className={clsx("relative h-4 overflow-hidden rounded-full bg-ink-950 ring-1 ring-white/10", flash && "animate-shake")}>
        <div className="absolute inset-y-0 rounded-full bg-white/25 transition-all delay-300 duration-1000" style={{ width: `${hp}%`, [align === "right" ? "right" : "left"]: 0 }} />
        <div className={clsx("absolute inset-y-0 rounded-full bg-gradient-to-r transition-all duration-500", color)} style={{ width: `${hp}%`, [align === "right" ? "right" : "left"]: 0 }} />
      </div>
    </div>
  );
}
