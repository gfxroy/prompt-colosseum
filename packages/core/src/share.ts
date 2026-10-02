/** Shareable URLs: suite JSON -> deflate-raw -> base64url (falls back to plain base64url). */
const toB64Url = (bytes: Uint8Array) => {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream !== "undefined") return "z" + toB64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
  return "p" + toB64Url(bytes);
}

export async function decodeShare<T = unknown>(token: string): Promise<T> {
  const kind = token[0];
  let bytes: Uint8Array = fromB64Url(token.slice(1));
  if (kind === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  else if (kind !== "p") throw new Error("unrecognised share token");
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
