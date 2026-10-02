const enabled = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const wrap = (code: string) => (s: string | number) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  enabled,
};
