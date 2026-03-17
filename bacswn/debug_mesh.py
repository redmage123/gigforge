"""Screenshot mesh network page."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 900})

    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text']", timeout=10000)
    page.fill("input[type='text']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)

    page.goto("http://localhost:8060/mesh")
    page.wait_for_timeout(6000)
    page.screenshot(path="/home/bbrelin/bacswn/debug_mesh.png", full_page=True)
    print("Mesh Network screenshot saved")

    browser.close()
