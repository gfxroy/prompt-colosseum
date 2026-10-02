import { describe, expect, it } from "vitest";
import { BOSSES, CHECKS_PER_LEVEL, MockProvider, dailyBoss, levelHint, runLevel, type LevelResult } from "../src";

const mock = { id: "mock", type: "mock" as const, model: "mock-1" };
const play = (boss: Parameters<typeof runLevel>[0]["boss"], prompt: string) => runLevel({ boss, prompt, providerConfig: mock, provider: new MockProvider(), live: false });
const detail = (r: LevelResult) => r.checks.map((c) => `${c.id}: ${c.pass ? "ok" : `${c.failedType} ${c.reason}`} || ${c.output.slice(0, 140)}`).join("\n");
/** The reference solution written as plain instructions, with no {{template}} variables at all. */
const plain = (s: string) => s.replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/\n{3,}/g, "\n\n");

describe("levels: ten of them, five labelled checks each", () => {
  it("has levels 1-10 with a one-line goal", () => {
    expect(BOSSES.map((b) => b.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const b of BOSSES) {
      expect(b.cases, b.id).toHaveLength(CHECKS_PER_LEVEL);
      expect(b.goal.length, b.id).toBeLessThan(90);
      expect(new Set(b.cases.map((c) => c.id)).size).toBe(CHECKS_PER_LEVEL);
      for (const c of b.cases) expect(c.description && c.description !== c.id, `${b.id}/${c.id}`).toBeTruthy();
    }
  });
});

describe("every level is winnable but not trivial (mock-1)", () => {
  for (const boss of BOSSES) {
    it(`${boss.level}. ${boss.name}`, async () => {
      const sol = await play(boss, boss.solution);
      expect(sol.won, detail(sol)).toBe(true);
      const plainSol = await play(boss, plain(boss.solution));
      expect(plainSol.won, detail(plainSol)).toBe(true);
      const starter = await play(boss, boss.starter);
      expect(starter.won, detail(starter)).toBe(false);
      expect(levelHint(starter), detail(starter)).toBeTruthy();
    });
  }
});

describe("daily challenge", () => {
  it("is deterministic per day, has five checks and varies across days", () => {
    const a = dailyBoss("2026-10-03");
    expect(dailyBoss("2026-10-03")).toEqual(a);
    expect(a.cases).toHaveLength(5);
    expect(a.daily).toBe(3);
    const names = new Set(Array.from({ length: 14 }, (_, i) => dailyBoss(`2026-10-${String(i + 1).padStart(2, "0")}`).name));
    expect(names.size).toBeGreaterThan(3);
  });

  it("stays winnable for the next 60 days", async () => {
    for (let i = 0; i < 60; i++) {
      const day = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      const boss = dailyBoss(day);
      const extra = boss.rule.includes("25 words") ? "\nKeep every reply under 25 words." : boss.rule.includes("unfortunately") ? '\nNever use the word "unfortunately".' : "";
      const r = await play(boss, boss.solution + extra);
      expect(r.won, `${day} ${boss.name} ${boss.rule}\n${detail(r)}`).toBe(true);
    }
  });
});
