"""Live smoke test (Playwright, headless). Usage: python3 scripts/e2e.py <base-url> [screenshot-dir]"""
import json, os, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1].rstrip("/") + "/"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
SOL = "Classify the sentiment of the review as positive, negative, or neutral (use neutral for mixed or flat reviews).\nRespond with only the label, in lowercase, nothing else."
errors = []

def shot(page, name, full=False):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name), full_page=full)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 860})
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE)
    expect(pg.get_by_test_id("howto")).to_be_visible(timeout=20000); print("✓ first-visit how-to overlay")
    pg.get_by_test_id("howto-ok").click()
    expect(pg.get_by_test_id("howto")).to_have_count(0)
    expect(pg.get_by_test_id("mode-badge")).to_have_text("Demo")
    pg.wait_for_timeout(300); shot(pg, "desktop-home.png")
    pg.get_by_test_id("level-1").click()
    pg.get_by_test_id("prompt-editor").fill(SOL)
    pg.get_by_test_id("fight").click()
    expect(pg.get_by_test_id("result")).to_be_visible(timeout=60000)
    title = pg.get_by_test_id("verdict-title").inner_text(); print("✓ level 1 result:", title)
    assert title == "You win"
    expect(pg.get_by_test_id("share-png")).to_be_visible(timeout=10000)
    assert pg.get_by_test_id("share-png").evaluate("i => i.naturalWidth") == 1200
    print("✓ share card:", pg.get_by_test_id("share-text").inner_text().replace("\n", " | "))
    pg.wait_for_timeout(300); shot(pg, "game-result.png", full=True)
    pg.goto(BASE + "#/daily")
    expect(pg.get_by_test_id("goal")).to_be_visible(timeout=10000); print("✓ daily loads:", pg.get_by_test_id("goal").inner_text()[:80])
    m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = m.new_page()
    mp.on("pageerror", lambda e: errors.append(str(e)))
    mp.goto(BASE); mp.get_by_test_id("howto-ok").click(); mp.wait_for_timeout(300)
    sw = mp.evaluate("() => document.documentElement.scrollWidth")
    assert sw <= 390, f"horizontal overflow {sw}"
    print("✓ mobile: no horizontal overflow"); shot(mp, "mobile-home.png")
    b.close()
print(json.dumps({"console_errors": errors}))
sys.exit(1 if errors else 0)
