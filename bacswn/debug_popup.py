"""Test clicking a station marker opens a popup."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text']", timeout=10000)
    page.fill("input[type='text']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)
    page.wait_for_timeout(6000)

    # Click first station marker
    station = page.locator(".station-marker").first
    station.click()
    page.wait_for_timeout(1000)

    # Screenshot with popup open
    page.screenshot(path="/home/bbrelin/bacswn/debug_popup.png", full_page=True)

    # Check popup content
    popup = page.evaluate("""() => {
        const p = document.querySelector('.leaflet-popup-content');
        return p ? p.innerHTML : 'NO POPUP';
    }""")
    print("Popup content:", popup[:500] if popup else "NONE")
    browser.close()
