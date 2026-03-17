"""Debug mesh network page errors."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 900})

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(f"[PAGE ERROR] {err.message}"))

    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text']", timeout=10000)
    page.fill("input[type='text']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)

    page.goto("http://localhost:8060/mesh")
    page.wait_for_timeout(8000)

    for e in errors:
        print(e)
    if not errors:
        print("No console errors found")

    # Check if any content rendered
    content = page.evaluate("() => document.querySelector('.main-content')?.innerHTML?.length || 0")
    print(f"Main content length: {content}")

    page.screenshot(path="/home/bbrelin/bacswn/debug_mesh.png", full_page=True)
    browser.close()
