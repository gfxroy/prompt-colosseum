export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)}s` : `${Math.round(x)}ms`);
export const usd = (x: number) => (x === 0 ? "$0" : x < 0.0001 ? `$${x.toExponential(1)}` : `$${x.toFixed(4)}`);
export const num = (x: number) => x.toLocaleString();
export const colLabel = (col: string) => col.replace("|", " · ");
