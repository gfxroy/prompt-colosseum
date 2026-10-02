import { useState } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import type { CaseAggregate, ChatMessage } from "@colosseum/core";
import { colLabel, ms, usd } from "../lib/format";

export default function CellDrawer({ agg, onClose }: { agg: CaseAggregate | null; onClose: () => void }) {
  const [rep, setRep] = useState(0);
  const [showJudge, setShowJudge] = useState<number | null>(null);
  if (!agg) return null;
  const cell = agg.cells[Math.min(rep, agg.cells.length - 1)];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-ink-850 p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} data-testid="cell-drawer">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-lg text-gold-300">{agg.testId}</div>
            <div className="text-sm text-gray-400">{colLabel(agg.column)}</div>
          </div>
          <button className="rounded-lg p-1 text-gray-400 hover:bg-white/10" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {agg.cells.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {agg.cells.map((c, i) => (
              <button key={i} onClick={() => setRep(i)} className={clsx("chip cursor-pointer", i === rep && "border-gold-400/60 text-gold-300", c.pass ? "text-emerald-300" : "text-rose-300")}>
                repeat {i + 1} {c.pass ? "✓" : "✗"}
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="chip">⏱ {ms(cell.latencyMs)}</span>
          <span className="chip">
            🔤 {cell.usage.inputTokens} in / {cell.usage.outputTokens} out
          </span>
          <span className="chip">💲 {usd(cell.costUsd)}</span>
          <span className={clsx("chip", cell.source === "live" ? "text-emerald-300" : cell.source === "recorded" ? "text-sky-300" : "text-violet-300")}>
            {cell.source === "recorded" ? "recorded real response" : cell.source === "mock" ? "mock-1 simulator" : cell.source}
          </span>
        </div>
        <div className="label mt-5">Assertions</div>
        <div className="space-y-1.5">
          {cell.assertions.map((a, i) => (
            <div key={i} className={clsx("rounded-lg px-3 py-2 text-xs", a.pass ? "bg-emerald-500/10" : "bg-rose-500/10")}>
              <div className="flex items-start gap-2">
                <span className={a.pass ? "text-emerald-300" : "text-rose-300"}>{a.pass ? "✓" : "✗"}</span>
                <span className="font-mono font-semibold text-gray-200">{a.type}</span>
                <span className="flex-1 text-gray-400">{a.reason}</span>
                {Boolean(a.details?.judgePrompt) && (
                  <button className="text-sky-300 underline" onClick={() => setShowJudge(showJudge === i ? null : i)}>
                    judge prompt
                  </button>
                )}
              </div>
              {showJudge === i && Boolean(a.details?.judgePrompt) && (
                <div className="mt-2 space-y-2">
                  {(a.details!.judgePrompt as ChatMessage[]).map((m, j) => (
                    <div key={j}>
                      <div className="text-[10px] font-bold text-gray-500 uppercase">{m.role}</div>
                      <pre className="mono rounded bg-ink-950 p-2 text-[11px] whitespace-pre-wrap text-gray-400">{m.content}</pre>
                    </div>
                  ))}
                  <div className="text-[10px] font-bold text-gray-500 uppercase">judge response ({String(a.details!.judgeModel)} · {String(a.details!.judgeSource)})</div>
                  <pre className="mono rounded bg-ink-950 p-2 text-[11px] whitespace-pre-wrap text-gray-300">{String(a.details!.judgeResponse)}</pre>
                </div>
              )}
            </div>
          ))}
          {!cell.assertions.length && <div className="text-xs text-gray-500">{cell.error ? "Request failed" : "No assertions"}</div>}
        </div>
        <div className="label mt-5">Output</div>
        <pre className="mono max-h-80 overflow-auto rounded-xl bg-ink-950 p-3 text-xs whitespace-pre-wrap text-gray-200">{cell.error ? `⚠ ${cell.error}` : cell.output}</pre>
        <div className="label mt-5">Rendered prompt</div>
        <div className="space-y-2">
          {cell.messages.map((m, i) => (
            <div key={i}>
              <div className="text-[10px] font-bold text-gray-500 uppercase">{m.role}</div>
              <pre className="mono max-h-56 overflow-auto rounded-xl bg-ink-950 p-3 text-xs whitespace-pre-wrap text-gray-400">{m.content}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
