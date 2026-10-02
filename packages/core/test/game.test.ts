import { describe, expect, it } from "vitest";
import { applyBattle, applyVote, BOSSES, emojiRow, expected, levelFor, MockProvider, newProgress, recordVote, runBattle, scoreBattle, shareText, tierFor, updateElo, type CellResult } from "../src";

const cell = (testId: string, promptId: string, passes: boolean[]): CellResult => ({
  key: `${promptId}|m|${testId}|0`,
  promptId,
  providerId: "m",
  testId,
  repeat: 0,
  messages: [],
  output: "",
  latencyMs: 1,
  usage: { inputTokens: 1, outputTokens: 1 },
  costUsd: 0,
  source: "mock",
  assertions: passes.map((p) => ({ type: "x", pass: p, score: p ? 1 : 0, reason: "", weight: 1 })),
  score: 0,
  pass: passes.every(Boolean),
});

describe("battle scoring", () => {
  const boss = { id: "b", cases: [{ id: "t1", vars: {}, assert: [] }, { id: "t2", vars: {}, assert: [] }] };
  it("drains HP proportionally and picks a verdict", () => {
    const r = scoreBattle(boss, [cell("t1", "you", [true, true]), cell("t1", "champion", [true, false]), cell("t2", "you", [true, false]), cell("t2", "champion", [false, false])], false);
    expect(r.rounds.map((x) => [Math.round(x.playerHp), Math.round(x.bossHp)])).toEqual([[100, 75], [75, 25]]);
    expect(r.verdict).toBe("victory");
    expect(emojiRow(r)).toBe("🟩🟨");
    expect(emojiRow(r, "champion")).toBe("🟨🟥");
  });
  it("detects draws", () => {
    const r = scoreBattle(boss, [cell("t1", "you", [true]), cell("t1", "champion", [true]), cell("t2", "you", [false]), cell("t2", "champion", [false])], false);
    expect(r.verdict).toBe("draw");
  });
  it("runs a real battle end-to-end on the mock", async () => {
    const boss = BOSSES[0];
    const r = await runBattle({ spec: { boss, playerPrompt: boss.solution }, providerConfig: { id: "mock", type: "mock", model: "mock-1" }, provider: new MockProvider(), live: false });
    expect(r.verdict).toBe("victory");
    expect(r.rounds).toHaveLength(boss.cases.length);
    const text = shareText({ result: r, bossName: boss.name, mode: "campaign", level: 1, rating: 916, tier: "🥉 Bronze", delta: 16, streak: 0, url: "https://x" });
    expect(text).toContain("Campaign Lv 1");
    expect(text).toContain("VICTORY 👍");
    expect(text).toContain("🟩🟩🟩🟩🟩🟩");
  });
});

describe("elo & tiers", () => {
  it("expected score and zero-sum updates", () => {
    expect(expected(1000, 1000)).toBe(0.5);
    const [a, b] = updateElo(1000, 1000, 1);
    expect([a, b]).toEqual([1016, 984]);
    const [c] = updateElo(900, 1500, 1);
    expect(c - 900).toBeGreaterThan(30);
  });
  it("maps ratings to tiers with divisions", () => {
    expect(tierFor(850).name).toBe("Bronze");
    expect(tierFor(1250)).toMatchObject({ name: "Gold", division: "III" });
    expect(tierFor(1390)).toMatchObject({ name: "Gold", division: "I" });
    expect(tierFor(2100)).toMatchObject({ name: "Legend", next: null, progress: 1 });
  });
  it("blind-vote leaderboard", () => {
    let board = recordVote({}, { id: "a", label: "A" }, { id: "b", label: "B" }, "a");
    board = recordVote(board, { id: "a", label: "A" }, { id: "b", label: "B" }, "tie");
    expect(board.a.rating).toBeGreaterThan(board.b.rating);
    expect(board.a).toMatchObject({ wins: 1, ties: 1, losses: 0 });
  });
});

describe("progression", () => {
  const win = scoreBattle({ id: "jason", cases: [{ id: "t", vars: {}, assert: [] }] }, [cell("t", "you", [true]), cell("t", "champion", [false])], false);
  const loss = scoreBattle({ id: "jason", cases: [{ id: "t", vars: {}, assert: [] }] }, [cell("t", "you", [false]), cell("t", "champion", [true])], true);
  it("awards xp, elo, first clear and badges", () => {
    const o = applyBattle(newProgress(), win, { bossId: "jason", bossRating: 950, mode: "campaign", promptLength: 100 });
    expect(o.firstClear).toBe(true);
    expect(o.ratingDelta).toBeGreaterThan(16);
    expect(o.progress.campaignCleared).toEqual(["jason"]);
    expect(o.newBadges.map((b) => b.id)).toEqual(expect.arrayContaining(["first-blood", "flawless", "minimalist"]));
    const again = applyBattle(o.progress, win, { bossId: "jason", bossRating: 950, mode: "campaign", promptLength: 100 });
    expect(again.firstClear).toBe(false);
    expect(again.newBadges).toEqual([]);
  });
  it("tracks daily streaks across consecutive days and resets on gaps", () => {
    let p = newProgress();
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) p = applyBattle(p, loss, { bossId: `daily-${day}`, bossRating: 1200, mode: "daily", day, promptLength: 300 }).progress;
    expect(p.streak).toBe(3);
    expect(p.badges["daily-3"]).toBeTruthy();
    p = applyBattle(p, win, { bossId: "daily-2026-10-05", bossRating: 1200, mode: "daily", day: "2026-10-05", promptLength: 300 }).progress;
    expect(p.streak).toBe(1);
    expect(p.bestStreak).toBe(3);
    // replaying the same day doesn't double count
    p = applyBattle(p, win, { bossId: "daily-2026-10-05", bossRating: 1200, mode: "daily", day: "2026-10-05", promptLength: 300 }).progress;
    expect(p.streak).toBe(1);
  });
  it("comeback + real-deal badges", () => {
    let p = newProgress();
    for (let i = 0; i < 3; i++) p = applyBattle(p, loss, { bossId: "jason", bossRating: 950, mode: "campaign", promptLength: 300 }).progress;
    const live = { ...win, live: true };
    const o = applyBattle(p, live, { bossId: "jason", bossRating: 950, mode: "campaign", promptLength: 300 });
    expect(o.newBadges.map((b) => b.id)).toEqual(expect.arrayContaining(["comeback", "real-deal"]));
  });
  it("level curve and votes", () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelFor(100).level).toBe(2);
    let p = newProgress();
    let badges: string[] = [];
    for (let i = 0; i < 20; i++) {
      const r = applyVote(p);
      p = r.progress;
      badges = badges.concat(r.newBadges.map((b) => b.id));
    }
    expect(badges).toEqual(["judge"]);
    expect(p.xp).toBe(100);
  });
});
