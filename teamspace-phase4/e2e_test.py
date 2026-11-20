import re
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"


def rand_suffix():
    return str(int(time.time() * 1000))[-6:]


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx1 = browser.new_context()
        ctx2 = browser.new_context()
        page1 = ctx1.new_page()
        page2 = ctx2.new_page()

        suffix = rand_suffix()
        org_name = f"E2E Org {suffix}"
        org_slug = f"e2e-org-{suffix}"

        # --- User 1: sign up, create a new org ---
        page1.goto(f"{BASE}/signup")
        page1.fill("label:has-text('Your name') input", "Ravi Owner")
        page1.fill("label:has-text('Email') input", f"ravi{suffix}@example.com")
        page1.fill("label:has-text('Password') input", "password123")
        page1.fill("label:has-text('Organization name') input", org_name)
        page1.click("button.primary-btn")
        page1.wait_for_selector("text=Teams", timeout=10000)
        print("User1 signed up and reached the Chat shell.")

        # Create a team
        page1.fill("input[placeholder='New team name']", "Engineering")
        page1.click(".inline-form button")
        page1.wait_for_selector("text=Engineering", timeout=10000)
        print("User1 created team 'Engineering'.")

        # Expand team, auto-created 'general' channel should be there
        page1.click("text=Engineering")
        page1.wait_for_selector("text=# general", timeout=10000)
        page1.click("text=# general")
        page1.wait_for_selector(".composer input", timeout=10000)
        print("User1 opened #general.")

        # --- User 2: sign up, join the SAME org ---
        page2.goto(f"{BASE}/signup")
        page2.click("button:has-text('Join an existing one')")
        page2.fill("label:has-text('Your name') input", "Asha Member")
        page2.fill("label:has-text('Email') input", f"asha{suffix}@example.com")
        page2.fill("label:has-text('Password') input", "password123")
        page2.fill("label:has-text('Organization slug') input", org_slug)
        page2.click("button.primary-btn")
        page2.wait_for_selector("text=Teams", timeout=10000)
        print("User2 signed up into the same org.")

        # User2 sees the team but must join it
        page2.wait_for_selector("text=Engineering", timeout=10000)
        page2.click("button:has-text('Join')")
        page2.wait_for_selector("text=# general", timeout=10000)
        page2.click("text=# general")
        page2.wait_for_selector(".composer input", timeout=10000)
        print("User2 joined the team and opened #general.")

        # --- Real-time chat round trip ---
        page1.fill(".composer input", "Hello from Ravi!")
        page1.click(".composer button")
        page2.wait_for_selector("text=Hello from Ravi!", timeout=10000)
        print("User2 received User1's message in real time.")

        page2.fill(".composer input", "Hey Ravi, got it!")
        page2.click(".composer button")
        page1.wait_for_selector("text=Hey Ravi, got it!", timeout=10000)
        print("User1 received User2's reply in real time.")

        # --- Reload to confirm persistence ---
        page1.reload()
        page1.wait_for_selector("text=Engineering", timeout=10000)
        page1.click("text=Engineering")
        page1.click("text=# general")
        page1.wait_for_selector("text=Hey Ravi, got it!", timeout=10000)
        print("After reload, message history persisted correctly.")

        page1.screenshot(path="/home/claude/teamspace/screenshot_chat.png", full_page=True)

        browser.close()
        print("E2E TEST PASSED")


run()
