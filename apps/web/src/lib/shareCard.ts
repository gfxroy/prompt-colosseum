import { cellScore, type BattleResult } from "@colosseum/core";

export interface CardData {
  result: BattleResult;
  bossName: string;
  bossEmoji: string;
  heading: string;
  rating: number;
  delta: number;
  tier: string;
  tierColor: string;
  streak: number;
  url: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const COLORS = { pass: "#34d399", partial: "#fbbf24", fail: "#f43f5e" };

/** Renders a 1200×630 social card (X / LinkedIn size). Squares are drawn, not emoji, so it works everywhere. */
export function renderShareCard(d: CardData): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0d12");
  bg.addColorStop(1, "#1a1420");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // arena glow
  const glow = ctx.createRadialGradient(W / 2, H + 120, 50, W / 2, H + 120, 700);
  glow.addColorStop(0, "rgba(249,115,22,0.35)");
  glow.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // columns
  ctx.fillStyle = "rgba(255,209,102,0.06)";
  for (let i = 0; i < 9; i++) ctx.fillRect(40 + i * 140, 120, 26, 460);

  const sans = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textBaseline = "alphabetic";
  const gold = ctx.createLinearGradient(0, 0, 500, 0);
  gold.addColorStop(0, "#ffd166");
  gold.addColorStop(1, "#f97316");
  ctx.fillStyle = gold;
  ctx.font = `800 34px ${sans}`;
  ctx.fillText("PROMPT COLOSSEUM", 60, 78);
  ctx.fillStyle = "#9ca3af";
  ctx.font = `500 26px ${sans}`;
  ctx.fillText(d.heading, 60, 118);

  const v = d.result.verdict;
  const vText = v === "victory" ? "VICTORY" : v === "draw" ? "DRAW" : "DEFEAT";
  const vColor = v === "victory" ? "#34d399" : v === "draw" ? "#fbbf24" : "#f43f5e";
  ctx.fillStyle = vColor;
  ctx.font = `900 110px ${sans}`;
  ctx.fillText(vText, 60, 245);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = `600 30px ${sans}`;
  ctx.fillText(`vs ${d.bossName}`, 64, 292);

  const rows: [string, "player" | "champion", number][] = [
    ["YOU", "player", d.result.playerHp],
    ["BOSS", "champion", d.result.bossHp],
  ];
  const n = d.result.rounds.length;
  const size = Math.min(64, Math.floor(620 / Math.max(1, n)) - 10);
  rows.forEach(([label, who, hp], r) => {
    const y = 340 + r * (size + 26);
    ctx.fillStyle = "#9ca3af";
    ctx.font = `700 24px ${sans}`;
    ctx.fillText(label, 60, y + size / 2 + 9);
    d.result.rounds.forEach((round, i) => {
      const s = cellScore(who === "player" ? round.player : round.champion);
      ctx.fillStyle = s >= 0.999 ? COLORS.pass : s > 0 ? COLORS.partial : COLORS.fail;
      roundRect(ctx, 160 + i * (size + 10), y, size, size, 10);
      ctx.fill();
    });
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `700 26px ${sans}`;
    ctx.fillText(`${Math.round(hp)} HP`, 160 + n * (size + 10) + 16, y + size / 2 + 9);
  });

  // right panel: rank
  roundRect(ctx, 830, 150, 310, 300, 24);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,209,102,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = d.tierColor;
  ctx.font = `800 40px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText(d.tier, 985, 215);
  ctx.fillStyle = "#f9fafb";
  ctx.font = `800 64px ${sans}`;
  ctx.fillText(String(d.rating), 985, 300);
  ctx.fillStyle = d.delta >= 0 ? "#34d399" : "#f43f5e";
  ctx.font = `700 28px ${sans}`;
  ctx.fillText(`Elo ${d.delta >= 0 ? "+" : ""}${d.delta}`, 985, 345);
  ctx.fillStyle = "#fbbf24";
  ctx.font = `700 26px ${sans}`;
  ctx.fillText(d.streak > 1 ? `${d.streak}-day streak` : d.result.live ? "LIVE MODEL" : "demo · mock-1", 985, 410);
  ctx.textAlign = "left";

  ctx.fillStyle = "#6b7280";
  ctx.font = `500 24px ${sans}`;
  ctx.fillText(d.url.replace(/^https?:\/\//, ""), 60, H - 40);
  ctx.textAlign = "right";
  ctx.fillText("Write a prompt. Beat the champion.", W - 60, H - 40);
  ctx.textAlign = "left";
  return canvas;
}
