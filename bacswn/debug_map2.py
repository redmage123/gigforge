"""Verify plane icons render on the Command Center map."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Login
    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text']", timeout=10000)
    page.fill("input[type='text']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)

    # Wait for map + data
    page.wait_for_timeout(6000)

    # Screenshot
    page.screenshot(path="/home/bbrelin/bacswn/debug_map_final.png", full_page=True)
    print("Screenshot saved")

    # Check aircraft markers
    aircraft = page.evaluate("""() => {
        const els = document.querySelectorAll('.aircraft-marker');
        return {
            count: els.length,
            samples: Array.from(els).slice(0, 3).map(el => ({
                outerHTML: el.outerHTML.substring(0, 600),
                hasSVG: el.querySelector('svg') !== null,
                hasPath: el.querySelector('path') !== null,
            }))
        };
    }""")
    print(f"\nAircraft markers: {aircraft['count']}")
    for s in aircraft['samples']:
        print(f"  hasSVG={s['hasSVG']} hasPath={s['hasPath']}")
        print(f"  HTML: {s['outerHTML'][:300]}")

    # Check station markers
    stations = page.evaluate("""() => document.querySelectorAll('.station-marker').length""")
    print(f"\nStation markers: {stations}")

    # All markers
    total = page.evaluate("""() => document.querySelectorAll('.leaflet-marker-icon').length""")
    print(f"Total markers: {total}")

    browser.close()
