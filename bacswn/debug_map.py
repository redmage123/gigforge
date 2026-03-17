"""Debug the Command Center map with Playwright."""
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Login first
    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text'], input[name='username']", timeout=10000)
    page.fill("input[type='text'], input[name='username']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)
    print("Logged in, now on:", page.url)

    # Wait for map to load
    page.wait_for_timeout(5000)

    # Screenshot the page
    page.screenshot(path="/home/bbrelin/bacswn/debug_screenshot.png", full_page=True)
    print("Screenshot saved to debug_screenshot.png")

    # Check what Leaflet markers exist
    markers = page.evaluate("""() => {
        const results = [];
        // Check all leaflet-marker-icon elements
        const icons = document.querySelectorAll('.leaflet-marker-icon');
        icons.forEach((el, i) => {
            results.push({
                index: i,
                className: el.className,
                innerHTML: el.innerHTML.substring(0, 300),
                style: el.getAttribute('style'),
                width: el.offsetWidth,
                height: el.offsetHeight,
            });
        });
        return results;
    }""")
    print(f"\n=== Found {len(markers)} Leaflet markers ===")
    for m in markers[:10]:
        print(json.dumps(m, indent=2))

    # Check for aircraft-marker specifically
    aircraft = page.evaluate("""() => {
        const els = document.querySelectorAll('.aircraft-marker');
        return {
            count: els.length,
            first_html: els.length > 0 ? els[0].outerHTML.substring(0, 500) : 'NONE',
        };
    }""")
    print(f"\n=== Aircraft markers: {aircraft['count']} ===")
    print(aircraft['first_html'])

    # Check for station-marker
    stations = page.evaluate("""() => {
        const els = document.querySelectorAll('.station-marker');
        return {
            count: els.length,
            first_html: els.length > 0 ? els[0].outerHTML.substring(0, 500) : 'NONE',
        };
    }""")
    print(f"\n=== Station markers: {stations['count']} ===")
    print(stations['first_html'])

    # Check for ANY SVG inside the map
    svgs = page.evaluate("""() => {
        const mapEl = document.querySelector('.leaflet-container');
        if (!mapEl) return 'NO MAP CONTAINER';
        const svgs = mapEl.querySelectorAll('svg');
        return {
            count: svgs.length,
            details: Array.from(svgs).slice(0, 5).map(s => ({
                width: s.getAttribute('width'),
                viewBox: s.getAttribute('viewBox'),
                html: s.outerHTML.substring(0, 200),
            }))
        };
    }""")
    print(f"\n=== SVGs in map: ===")
    print(json.dumps(svgs, indent=2))

    # Check the tile layer URLs
    tiles = page.evaluate("""() => {
        const imgs = document.querySelectorAll('.leaflet-tile');
        return imgs.length > 0 ? {
            count: imgs.length,
            first_src: imgs[0].src,
            loaded: Array.from(imgs).filter(i => i.complete).length,
        } : 'NO TILES';
    }""")
    print(f"\n=== Tile layers: ===")
    print(json.dumps(tiles, indent=2))

    # Check console errors
    console_msgs = []
    page.on("console", lambda msg: console_msgs.append({"type": msg.type, "text": msg.text}))
    page.wait_for_timeout(2000)
    if console_msgs:
        print(f"\n=== Console messages: ===")
        for m in console_msgs:
            print(f"  [{m['type']}] {m['text']}")

    browser.close()
    print("\nDone.")
