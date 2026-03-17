"""Verify Hurricane Ops page renders."""
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

    # Navigate to Hurricane Ops
    page.goto("http://localhost:8060/hurricane")
    page.wait_for_timeout(6000)

    page.screenshot(path="/home/bbrelin/bacswn/debug_hurricane.png", full_page=True)
    print("Hurricane Ops screenshot saved")

    # Also screenshot the Command Center
    page.goto("http://localhost:8060/")
    page.wait_for_timeout(5000)
    page.screenshot(path="/home/bbrelin/bacswn/debug_command_center.png", full_page=True)
    print("Command Center screenshot saved")

    browser.close()
