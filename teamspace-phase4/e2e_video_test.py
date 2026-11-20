import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

FAKE_MEDIA_ARGS = [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
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
        page1.on("console", lambda m: print("  [page1 console]", m.text) if "error" in m.type else None)
        page2.on("console", lambda m: print("  [page2 console]", m.text) if "error" in m.type else None)

        suffix = rand_suffix()
        org_name = f"Video E2E Org {suffix}"
        org_slug = f"video-e2e-org-{suffix}"

        # --- User 1: sign up, create a new org, team, channel ---
        page1.goto(f"{BASE}/signup")
        page1.fill("label:has-text('Your name') input", "Vera Host")
        page1.fill("label:has-text('Email') input", f"vera{suffix}@example.com")
        page1.fill("label:has-text('Password') input", "password123")
        page1.fill("label:has-text('Organization name') input", org_name)
        page1.click("button.primary-btn")
        page1.wait_for_selector("text=Teams", timeout=10000)
        print("User1 signed up.")

        page1.fill("input[placeholder='New team name']", "Design")
        page1.click(".inline-form button")
        page1.wait_for_selector("text=Design", timeout=10000)
        page1.click("text=Design")
        page1.wait_for_selector("text=# general", timeout=10000)
        page1.click("text=# general")
        page1.wait_for_selector(".composer input", timeout=10000)
        print("User1 created team 'Design' and opened #general.")

        # --- User 2: sign up, join the same org + team ---
        page2.goto(f"{BASE}/signup")
        page2.click("button:has-text('Join an existing one')")
        page2.fill("label:has-text('Your name') input", "Oscar Guest")
        page2.fill("label:has-text('Email') input", f"oscar{suffix}@example.com")
        page2.fill("label:has-text('Password') input", "password123")
        page2.fill("label:has-text('Organization slug') input", org_slug)
        page2.click("button.primary-btn")
        page2.wait_for_selector("text=Teams", timeout=10000)
        page2.wait_for_selector("text=Design", timeout=10000)
        page2.click("button:has-text('Join')")
        page2.wait_for_selector("text=# general", timeout=10000)
        page2.click("text=# general")
        page2.wait_for_selector(".composer input", timeout=10000)
        print("User2 joined org + team, opened #general.")

        # --- User1 starts the call ---
        page1.click("button:has-text('Start/Join video call')")
        page1.wait_for_selector(".video-call", timeout=10000)
        print("User1 started the video call.")

        # wait for user1's own local tile to render (video element with a track)
        page1.wait_for_selector(".video-tile video", timeout=15000)
        print("User1 sees their own local video tile.")

        # --- User2 joins the same call ---
        page2.click("button:has-text('Start/Join video call')")
        page2.wait_for_selector(".video-call", timeout=10000)
        print("User2 joined the video call.")

        # Each side should now see 2 tiles (themselves + the other participant)
        page1.wait_for_function(
            "document.querySelectorAll('.video-tile').length >= 2", timeout=20000
        )
        print("User1 now sees 2 video tiles (both participants).")

        page2.wait_for_function(
            "document.querySelectorAll('.video-tile').length >= 2", timeout=20000
        )
        print("User2 now sees 2 video tiles (both participants).")

        # Confirm remote video elements actually have active tracks (readyState/videoWidth > 0)
        page1.wait_for_function(
            """() => {
                const vids = Array.from(document.querySelectorAll('.video-tile video'));
                return vids.length >= 2 && vids.every(v => v.videoWidth > 0);
            }""",
            timeout=20000,
        )
        print("User1: all video tiles have real, non-zero-dimension video frames flowing.")

        page2.wait_for_function(
            """() => {
                const vids = Array.from(document.querySelectorAll('.video-tile video'));
                return vids.length >= 2 && vids.every(v => v.videoWidth > 0);
            }""",
            timeout=20000,
        )
        print("User2: all video tiles have real, non-zero-dimension video frames flowing.")

        page1.wait_for_selector("text=2 in call", timeout=10000)
        page2.wait_for_selector("text=2 in call", timeout=10000)
        print("Both sides report '2 in call'.")

        page1.screenshot(path="/home/claude/teamspace/screenshot_video_call.png", full_page=True)

        # --- User2 leaves; User1 should drop back to 1 participant ---
        page2.click("button[aria-label='Leave call']")
        page1.wait_for_function(
            "document.querySelectorAll('.video-tile').length === 1", timeout=15000
        )
        print("After User2 left, User1 is back down to 1 tile (their own).")

        browser.close()
        print("VIDEO E2E TEST PASSED")


run()
