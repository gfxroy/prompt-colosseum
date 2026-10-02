import { useState } from "react";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import type { ProviderConfig } from "@colosseum/core";
import Modal from "./Modal";
import { keyStore } from "../lib/state";
import { PRESET_MODELS } from "../lib/providers";

type Kind = "gemini" | "openai" | "openai-compatible";

export default function KeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const k = keyStore.use();
  const [kind, setKind] = useState<Kind>((k.active?.type as Kind) ?? "gemini");
  const [key, setKey] = useState("");
  const [model, setModel] = useState(k.active?.model ?? PRESET_MODELS.gemini[0]);
  const [baseUrl, setBaseUrl] = useState(k.compatibleBaseUrl ?? "https://openrouter.ai/api/v1");
  const hasKey = (t: Kind) => (t === "gemini" ? Boolean(k.keys.gemini) : t === "openai" ? Boolean(k.keys.openai) : Boolean(k.keys.compatible?.live));

  const save = () => {
    const active: ProviderConfig = { id: "live", type: kind, model: model.trim(), label: model.trim(), ...(kind === "openai-compatible" ? { baseUrl: baseUrl.trim() } : {}) };
    keyStore.set((s) => {
      const keys = { ...s.keys, compatible: { ...(s.keys.compatible ?? {}) } };
      if (key.trim()) {
        if (kind === "gemini") keys.gemini = key.trim();
        else if (kind === "openai") keys.openai = key.trim();
        else {
          keys.compatible!.live = key.trim();
          keys.compatible![baseUrl.trim()] = key.trim();
        }
      }
      return { keys, active, compatibleBaseUrl: kind === "openai-compatible" ? baseUrl.trim() : s.compatibleBaseUrl };
    });
    setKey("");
    onClose();
  };
  const clear = () => {
    keyStore.reset();
    setKey("");
  };

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><KeyRound size={18} className="text-gold-400" /> Bring your own key</span>}>
      <div className="space-y-4">
        <p className="text-sm text-gray-400">
          Without a key everything runs in <b className="text-gray-200">demo mode</b>: battles use <b className="text-gray-200">mock-1</b>, a deterministic instruction-following simulator, and the
          workbench replays <b className="text-gray-200">real recorded</b> Gemini responses. Add a key to fight real models.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["gemini", "openai", "openai-compatible"] as Kind[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setKind(t);
                setModel(t === "openai-compatible" ? "meta-llama/llama-3.3-70b-instruct" : PRESET_MODELS[t][0]);
              }}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${kind === t ? "border-gold-400/60 bg-gold-400/10 text-gold-300" : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"}`}
            >
              {t === "gemini" ? "Gemini" : t === "openai" ? "OpenAI" : "Compatible"}
              {hasKey(t) && <span className="ml-1 text-emerald-400">●</span>}
            </button>
          ))}
        </div>
        {kind === "openai-compatible" && (
          <div>
            <label className="label" htmlFor="baseurl">Base URL</label>
            <input id="baseurl" className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" />
            <p className="mt-1 text-xs text-gray-500">OpenRouter, Groq, Together, a local Ollama/vLLM (http://localhost:11434/v1)… must allow browser CORS.</p>
          </div>
        )}
        <div>
          <label className="label" htmlFor="apikey">API key {hasKey(kind) && <span className="normal-case text-emerald-400">(saved for this tab - leave blank to keep)</span>}</label>
          <input id="apikey" type="password" autoComplete="off" className="input mono" value={key} onChange={(e) => setKey(e.target.value)} placeholder={kind === "gemini" ? "AIza…" : "sk-…"} />
        </div>
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input id="model" list="models" className="input mono" value={model} onChange={(e) => setModel(e.target.value)} />
          <datalist id="models">{kind !== "openai-compatible" && PRESET_MODELS[kind].map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200/90">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>Your key is kept in this tab's sessionStorage only and sent directly from your browser to the provider. There is no backend. Closing the tab forgets it.</span>
        </div>
        <div className="flex justify-between gap-2">
          <button className="btn-danger" onClick={clear}>
            <Trash2 size={15} /> Forget keys
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-gold" onClick={save} disabled={!model.trim() || (!key.trim() && !hasKey(kind))} data-testid="save-key">
              Save & use {model.trim() || "model"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
