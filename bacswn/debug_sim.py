"""Screenshot simulations page."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 900})

    errors = []
    page.on("pageerror", lambda err: errors.append(err.message[:200]))

    page.goto("http://localhost:8060/login")
    page.wait_for_selector("input[type='text']", timeout=10000)
    page.fill("input[type='text']", "admin")
    page.fill("input[type='password']", "admin")
    page.click("button[type='submit']")
    page.wait_for_url("**/", timeout=10000)

    page.goto("http://localhost:8060/simulations")
    page.wait_for_timeout(5000)
    page.screenshot(path="/home/bbrelin/bacswn/debug_sim_picker.png", full_page=True)
    print(f"Picker screenshot saved ({len(errors)} errors)")
    for e in errors:
        print(f"  ERROR: {e}")

    # Click the first "Run Simulation" button if present
    run_btn = page.locator("text=Run Simulation").first
    if run_btn.is_visible():
        run_btn.click()
        page.wait_for_timeout(10000)  # let it auto-advance a few steps
        page.screenshot(path="/home/bbrelin/bacswn/debug_sim_running.png", full_page=True)
        print("Running screenshot saved")
    else:
        print("No Run button found")

    browser.close()
