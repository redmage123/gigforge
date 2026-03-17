"""Screenshot simulation at multiple steps to verify map updates."""
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

    page.goto("http://localhost:8060/simulations")
    page.wait_for_timeout(3000)

    # Start hurricane simulation
    page.locator("text=Run Simulation").first.click()
    page.wait_for_timeout(3000)

    # Click play button (exact match)
    page.get_by_role("button", name="\u25b6", exact=True).click()
    page.wait_for_timeout(15000)  # 5 steps at 3s each

    page.screenshot(path="/home/bbrelin/bacswn/debug_sim_step5.png", full_page=True)
    print("Mid-simulation screenshot saved")

    # Wait for more steps
    page.wait_for_timeout(12000)
    page.screenshot(path="/home/bbrelin/bacswn/debug_sim_step8.png", full_page=True)
    print("Late-simulation screenshot saved")

    browser.close()
