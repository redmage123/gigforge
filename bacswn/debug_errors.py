"""Check for JS errors on all pages."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 900})

    errors = []
    page.on("pageerror", lambda err: errors.append(f"[{page.url}] {err.message[:200]}"))

    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text']", timeout=10000)
    page.fill("input[type='text']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)
    page.wait_for_timeout(3000)
    print(f"/ errors: {len(errors)}")

    page.goto("http://localhost:8060/mesh")
    page.wait_for_timeout(5000)
    print(f"/mesh errors: {len(errors)}")
    for e in errors:
        print("  ", e)

    browser.close()
