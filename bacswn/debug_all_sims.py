"""Screenshot each simulation scenario at an interesting step."""
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

    scenarios = ["hurricane_landfall", "squall_line", "sensor_fault", "hub_failure", "ifr_event", "tropical_wave"]

    for sid in scenarios:
        page.goto("http://localhost:8060/simulations")
        page.wait_for_timeout(2000)

        # Click the matching scenario card
        cards = page.locator(".card")
        for i in range(cards.count()):
            text = cards.nth(i).inner_text()
            if sid.replace("_", " ") in text.lower() or (sid == "hurricane_landfall" and "hurricane" in text.lower()):
                cards.nth(i).locator("text=Run Simulation").click()
                break

        page.wait_for_timeout(2000)

        # Auto-play to step 5
        page.get_by_role("button", name="\u25b6", exact=True).click()
        page.wait_for_timeout(15000)  # 5 steps

        page.screenshot(path=f"/home/bbrelin/bacswn/debug_sim_{sid}.png", full_page=False)
        print(f"  {sid}: screenshot saved")

        # Go back
        page.locator("text=Back to Scenarios").click()
        page.wait_for_timeout(1000)

    browser.close()
    print("All done")
