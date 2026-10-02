"""End-to-end smoke test (Playwright, headless). Usage: python3 scripts/e2e.py <base-url> [screenshot-dir]

Verifies in demo mode (no API key): a campaign battle completes with a verdict + share card PNG,
the Daily Duel loads, the blind A/B vote works, an example suite runs in the workbench and the
results grid + regression view render, with zero console errors."""
import json, sys, os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") + "/"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
SOLUTION = (
    "Classify the sentiment of the review as positive, negative, or neutral (use neutral for mixed or flat reviews).\n"
    "Respond with only the label, in lowercase, nothing else.\n\nReview: {{review}}"
)
errors = []
checks = []

def ok(name):
    checks.append(name)
    print("  ✓", name, flush=True)

def shot(page, name, full=False):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1400, "height": 900}, device_scale_factor=1)
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE)
    expect(page.get_by_test_id("cta-daily")).to_be_visible(timeout=20000)
    expect(page.get_by_test_id("mode-badge")).to_contain_text("DEMO")
    ok("home loads, demo mode badge shown")
    shot(page, "home")

    # Campaign battle: level 1 boss with a strong prompt
    page.goto(BASE + "#/battle/sentimentus")
    ed = page.get_by_test_id("prompt-editor")
    expect(ed).to_be_visible(timeout=15000)
    ed.fill(SOLUTION)
    page.get_by_test_id("fight").click()
    expect(page.get_by_test_id("arena")).to_be_visible(timeout=15000)
    page.wait_for_timeout(2500)
    shot(page, "arena")
    ok("arena renders with HP bars" if page.get_by_test_id("hp-you").count() else "arena renders")
    page.get_by_test_id("skip").click()
    expect(page.get_by_test_id("verdict")).to_be_visible(timeout=60000)
    title = page.get_by_test_id("verdict-title").inner_text()
    ok(f"battle completes → verdict '{title.strip()}'")
    expect(page.get_by_test_id("share-text")).to_contain_text("Prompt Colosseum")
    expect(page.get_by_test_id("share-png")).to_be_visible(timeout=15000)
    w = page.get_by_test_id("share-png").evaluate("i => i.naturalWidth")
    assert w == 1200, f"share card width {w}"
    ok("share card renders (emoji text + 1200px PNG)")
    page.wait_for_timeout(1200)
    shot(page, "verdict", full=True)

    # Daily duel
    page.goto(BASE + "#/daily")
    expect(page.get_by_test_id("prompt-editor")).to_be_visible(timeout=15000)
    ok("daily duel loads")

    # Blind vote
    page.goto(BASE + "#/vote")
    expect(page.get_by_test_id("vote-a-btn")).to_be_visible(timeout=15000)
    page.get_by_test_id("vote-a-btn").click()
    expect(page.get_by_test_id("vote-next")).to_be_visible(timeout=10000)
    ok("blind A/B vote records a vote")
    shot(page, "vote")

    # Workbench
    page.goto(BASE + "#/workbench")
    page.get_by_test_id("empty-json-extraction").click()
    expect(page.get_by_test_id("suite-title")).to_contain_text("JSON", timeout=10000)
    page.get_by_test_id("tab-run").click()
    page.get_by_test_id("run-suite").click()
    expect(page.get_by_test_id("results")).to_be_visible(timeout=90000)
    expect(page.get_by_test_id("heatmap")).to_be_visible()
    ok("example suite runs in demo mode → results grid + heatmap")
    page.wait_for_timeout(800)
    shot(page, "results", full=True)
    page.get_by_test_id("tab-compare").click()
    expect(page.get_by_test_id("regression-banner")).to_be_visible(timeout=10000)
    banner = page.get_by_test_id("regression-banner").inner_text()
    ok(f"regression view: {banner.splitlines()[0][:100]}")
    shot(page, "compare", full=True)

    browser.close()

real = [e for e in errors if "favicon" not in e]
print(json.dumps({"checks": len(checks), "console_errors": real}, indent=1))
sys.exit(1 if real else 0)
