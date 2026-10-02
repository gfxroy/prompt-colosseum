import { toastStore } from "./toast";

export default function Toasts() {
  const { toasts } = toastStore.use();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="card animate-pop flex items-start gap-3 border-gold-400/30 bg-ink-850/95 p-3 shadow-xl shadow-black/40">
          <div className="text-2xl">{t.emoji}</div>
          <div>
            <div className="text-sm font-bold text-white">{t.title}</div>
            {t.body && <div className="text-xs text-gray-400">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
