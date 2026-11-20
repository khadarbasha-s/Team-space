import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

FAKE_MEDIA_ARGS = [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--auto-select-desktop-capture-source=Entire screen",
]


def rand_suffix():
    return str(int(time.time() * 1000))[-6:]


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=FAKE_MEDIA_ARGS)
        ctx1 = browser.new_context(permissions=["camera", "microphone"])
        ctx2 = browser.new_context(permissions=["camera", "microphone"])
        page1 = ctx1.new_page()
        page2 = ctx2.new_page()

        suffix = rand_suffix()
        org_name = f"Screenshare Org {suffix}"
        org_slug = f"screenshare-org-{suffix}"

        page1.goto(f"{BASE}/signup")
        page1.fill("label:has-text('Your name') input", "Nisha Presenter")
        page1.fill("label:has-text('Email') input", f"nisha{suffix}@example.com")
        page1.fill("label:has-text('Password') input", "password123")
        page1.fill("label:has-text('Organization name') input", org_name)
        page1.click("button.primary-btn")
        page1.wait_for_selector("text=Teams", timeout=10000)

        page1.fill("input[placeholder='New team name']", "Sales")
        page1.click(".inline-form button")
        page1.wait_for_selector("text=Sales", timeout=10000)
        page1.click("text=Sales")
        page1.wait_for_selector("text=# general", timeout=10000)
        page1.click("text=# general")
        page1.wait_for_selector(".composer input", timeout=10000)
        print("User1 set up org + team + channel.")

        page2.goto(f"{BASE}/signup")
        page2.click("button:has-text('Join an existing one')")
        page2.fill("label:has-text('Your name') input", "Victor Viewer")
        page2.fill("label:has-text('Email') input", f"victor{suffix}@example.com")
        page2.fill("label:has-text('Password') input", "password123")
        page2.fill("label:has-text('Organization slug') input", org_slug)
        page2.click("button.primary-btn")
        page2.wait_for_selector("text=Teams", timeout=10000)
        page2.wait_for_selector("text=Sales", timeout=10000)
        page2.click("button:has-text('Join')")
        page2.wait_for_selector("text=# general", timeout=10000)
        page2.click("text=# general")
        page2.wait_for_selector(".composer input", timeout=10000)
        print("User2 joined org + team + channel.")

        page1.click("button:has-text('Start/Join video call')")
        page1.wait_for_selector(".video-call", timeout=10000)
        page2.click("button:has-text('Start/Join video call')")
        page2.wait_for_selector(".video-call", timeout=10000)

        page1.wait_for_function("document.querySelectorAll('.video-tile').length >= 2", timeout=20000)
        page2.wait_for_function("document.querySelectorAll('.video-tile').length >= 2", timeout=20000)
        print("Both users are in the call with their camera tiles visible.")

        # --- User1 shares their screen ---
        page1.click("button[aria-label='Share screen']")
        page1.wait_for_selector("button[aria-label='Stop sharing']", timeout=10000)
        print("User1 started screen sharing (button flipped to 'Stop sharing').")

        # User1 should see their own screen-share tile locally
        page1.wait_for_selector(".video-tile-screen", timeout=15000)
        page1.wait_for_function(
            "document.querySelector('.video-tile-screen video')?.videoWidth > 0", timeout=15000
        )
        print("User1 sees their own screen-share tile with real video frames.")

        # User2 (a separate browser/session) should receive the same screen-share track
        page2.wait_for_selector(".video-tile-screen", timeout=15000)
        page2.wait_for_function(
            "document.querySelector('.video-tile-screen video')?.videoWidth > 0", timeout=15000
        )
        page2.wait_for_selector("text=Nisha Presenter's screen", timeout=10000)
        print("User2 receives User1's screen-share track in real time, correctly labeled.")

        page2.screenshot(path="/home/claude/teamspace/screenshot_screenshare.png", full_page=True)

        # --- User1 stops sharing; the tile should disappear on both sides ---
        page1.click("button[aria-label='Stop sharing']")
        page1.wait_for_selector("button[aria-label='Share screen']", timeout=10000)
        page1.wait_for_function(
            "document.querySelectorAll('.video-tile-screen').length === 0", timeout=15000
        )
        page2.wait_for_function(
            "document.querySelectorAll('.video-tile-screen').length === 0", timeout=15000
        )
        print("After User1 stopped sharing, the screen tile is gone on both sides.")

        # Camera tiles should be unaffected throughout
        page1.wait_for_function("document.querySelectorAll('.video-tile').length >= 2", timeout=10000)
        page2.wait_for_function("document.querySelectorAll('.video-tile').length >= 2", timeout=10000)
        print("Camera video tiles are still intact after the screen share ended.")

        browser.close()
        print("SCREEN SHARE E2E TEST PASSED")


run()
