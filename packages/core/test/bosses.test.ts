import { describe, expect, it } from "vitest";
import { BOSSES, MockProvider, runBattle, dailyBoss, battleHints } from "../src";

const mock = { id: "mock", type: "mock" as const, model: "mock-1" };

describe("campaign bosses are winnable but not trivial (mock-1)", () => {
  for (const boss of BOSSES) {
    it(`${boss.level}. ${boss.name}`, async () => {
      const champ = await runBattle({ spec: { boss, playerPrompt: boss.edits === "system" ? boss.champion.system! : boss.champion.template }, providerConfig: mock, provider: new MockProvider(), live: false });
      const sol = await runBattle({ spec: { boss, playerPrompt: boss.solution }, providerConfig: mock, provider: new MockProvider(), live: false });
      const starter = await runBattle({ spec: { boss, playerPrompt: boss.starter }, providerConfig: mock, provider: new MockProvider(), live: false });
      const detail = (r: typeof sol) => r.rounds.map((x) => `${x.testId}: ${x.player.assertions.filter((a) => !a.pass).map((a) => a.type + " " + a.reason).join("; ")} || ${x.player.output.slice(0, 160)}`).join("\n");
      expect(sol.verdict, detail(sol)).toBe("victory");
      expect(sol.playerScore, detail(sol)).toBeGreaterThanOrEqual(0.95);
      expect(champ.verdict).toBe("draw"); // champion vs itself
      expect(sol.championScore).toBeLessThan(0.95);
      expect(sol.championScore).toBeGreaterThan(0.15);
      expect(starter.verdict, detail(starter)).not.toBe("victory");
      expect(battleHints(starter).length).toBeGreaterThan(0);
    });
  }
});

describe("daily duel", () => {
  it("is deterministic per day and varies across days", () => {
    const a = dailyBoss("2026-10-03");
    const b = dailyBoss("2026-10-03");
    expect(a).toEqual(b);
    const names = new Set(Array.from({ length: 14 }, (_, i) => dailyBoss(`2026-10-${String(i + 1).padStart(2, "0")}`).name));
    expect(names.size).toBeGreaterThan(3);
    expect(a.cases.length).toBeGreaterThan(2);
    expect(a.duel).toBe(3);
  });
});

describe("daily duels stay winnable for 60 days", () => {
  it("solution (+ twist rule) never loses", async () => {
    for (let i = 0; i < 60; i++) {
      const day = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      const boss = dailyBoss(day);
      const extra = boss.twist.includes("25 words") ? "\nKeep every answer under 25 words." : "";
      const r = await runBattle({ spec: { boss, playerPrompt: boss.solution + extra }, providerConfig: mock, provider: new MockProvider(), live: false });
      expect(r.verdict, `${day} ${boss.name} ${boss.twist} ${r.playerScore} vs ${r.championScore}`).not.toBe("defeat");
    }
  });
});
