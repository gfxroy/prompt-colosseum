import type { LevelResult } from "@colosseum/core";

/** 1200×630 white-on-black share card. */
export async function renderShareCard(result: LevelResult, title: string): Promise<string> {
  await document.fonts?.ready;
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0a0a";
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#a1a1a1";
  g.font = "500 30px Inter, system-ui, sans-serif";
  g.fillText("Prompt Colosseum", 90, 120);
  g.fillStyle = "#fafafa";
  g.font = "600 76px Inter, system-ui, sans-serif";
  g.fillText(title, 90, 225);
  const s = 92, gap = 22, y = 300;
  result.checks.forEach((ch, i) => {
    const x = 90 + i * (s + gap);
    if (ch.pass) {
      g.fillStyle = "#fafafa";
      g.fillRect(x, y, s, s);
    } else {
      g.strokeStyle = "#3d3d3d";
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
    }
  });
  g.fillStyle = "#fafafa";
  g.font = "500 44px Inter, system-ui, sans-serif";
  g.fillText(`${result.passed}/${result.total}`, 90 + 5 * (s + gap) + 16, y + 64);
  g.fillStyle = "#6e6e6e";
  g.font = "400 26px Inter, system-ui, sans-serif";
  g.fillText("gfxroy.github.io/prompt-colosseum", 90, 545);
  return c.toDataURL("image/png");
}
