import type { Embedder } from "@colosseum/core";

/**
 * Optional in-browser sentence embeddings (all-MiniLM-L6-v2 via transformers.js, loaded from a CDN on demand).
 * Nothing is downloaded unless the user enables semantic similarity.
 */
let loading: Promise<Embedder> | null = null;
const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";

export function loadEmbedder(onProgress?: (msg: string) => void): Promise<Embedder> {
  loading ??= (async () => {
    onProgress?.("Loading transformers.js…");
    const mod = (await import(/* @vite-ignore */ CDN)) as {
      pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<(t: string | string[], o: Record<string, unknown>) => Promise<{ tolist: () => number[][] }>>;
    };
    onProgress?.("Downloading MiniLM (~23 MB, cached after first use)…");
    const extractor = await mod.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      progress_callback: (p: { status?: string; progress?: number }) => p.progress && onProgress?.(`Downloading model… ${Math.round(p.progress)}%`),
    });
    onProgress?.("Embeddings ready");
    const cache = new Map<string, number[]>();
    return {
      name: "MiniLM-L6 (in-browser)",
      async embed(texts: string[]) {
        const todo = texts.filter((t) => !cache.has(t));
        if (todo.length) {
          const out = await extractor(todo, { pooling: "mean", normalize: true });
          out.tolist().forEach((v, i) => cache.set(todo[i], v));
        }
        return texts.map((t) => cache.get(t)!);
      },
    };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}
