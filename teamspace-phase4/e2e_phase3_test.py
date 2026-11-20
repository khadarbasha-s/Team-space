import os
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"


def rand_suffix():
    return str(int(time.time() * 1000))[-6:]


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx1 = browser.new_context(accept_downloads=True)
        ctx2 = browser.new_context(accept_downloads=True)
        page1 = ctx1.new_page()
        page2 = ctx2.new_page()

        suffix = rand_suffix()
        org_name = f"Phase3 Org {suffix}"
        org_slug = f"phase3-org-{suffix}"

        # --- User1: sign up, create org + team ---
        page1.goto(f"{BASE}/signup")
        page1.fill("label:has-text('Your name') input", "Priya Lead")
        page1.fill("label:has-text('Email') input", f"priya{suffix}@example.com")
        page1.fill("label:has-text('Password') input", "password123")
        page1.fill("label:has-text('Organization name') input", org_name)
        page1.click("button.primary-btn")
        page1.wait_for_selector("text=Teams", timeout=10000)

        page1.fill("input[placeholder='New team name']", "Marketing")
        page1.click(".inline-form button")
        page1.wait_for_selector("text=Marketing", timeout=10000)
        page1.click("text=Marketing")
        page1.wait_for_selector("text=# general", timeout=10000)
        page1.click("text=# general")
        page1.wait_for_selector(".composer input", timeout=10000)
        print("User1 set up org + team + channel.")

        # --- User2: join same org + team ---
        page2.goto(f"{BASE}/signup")
        page2.click("button:has-text('Join an existing one')")
        page2.fill("label:has-text('Your name') input", "Dinesh Analyst")
        page2.fill("label:has-text('Email') input", f"dinesh{suffix}@example.com")
        page2.fill("label:has-text('Password') input", "password123")
        page2.fill("label:has-text('Organization slug') input", org_slug)
        page2.click("button.primary-btn")
        page2.wait_for_selector("text=Teams", timeout=10000)
        page2.wait_for_selector("text=Marketing", timeout=10000)
        page2.click("button:has-text('Join')")
        page2.wait_for_selector("text=# general", timeout=10000)
        page2.click("text=# general")
        page2.wait_for_selector(".composer input", timeout=10000)
        print("User2 joined org + team + channel.")

        # =========== FILES ===========
        # Create a real file to upload
        upload_path = "/tmp/phase3_report.txt"
        with open(upload_path, "w") as f:
            f.write("Q4 marketing report -- real content for the phase 3 file-sharing test.\n")

        page1.click("button:has-text('Files')")
        page1.wait_for_selector(".files-panel", timeout=10000)
        with page1.expect_file_chooser() as fc_info:
            page1.click("button:has-text('Upload a file')")
        fc_info.value.set_files(upload_path)
        page1.wait_for_selector("text=phase3_report.txt", timeout=10000)
        print("User1 uploaded a file; it shows up in their own Files tab.")

        # User2 switches to Files tab on the same channel and should see it too
        page2.click("button:has-text('Files')")
        page2.wait_for_selector("text=phase3_report.txt", timeout=10000)
        print("User2 (different browser/session) sees the file User1 uploaded.")
        page2.screenshot(path="/home/claude/teamspace/screenshot_files_tab.png", full_page=True)

        # User2 downloads it and we verify the bytes match what was uploaded
        with page2.expect_download() as download_info:
            page2.click(".file-table tbody tr button:has-text('Download')")
        download = download_info.value
        downloaded_path = "/tmp/phase3_downloaded.txt"
        download.save_as(downloaded_path)
        with open(upload_path, "rb") as a, open(downloaded_path, "rb") as b:
            assert a.read() == b.read(), "Downloaded file content does not match the uploaded file!"
        print("User2 downloaded the file and its bytes exactly match the original upload.")

        # Back to messages tab, confirm chat still works independently of the Files tab
        page1.click("button:has-text('Messages')")
        page1.wait_for_selector(".composer input", timeout=10000)
        page1.fill(".composer input", "Uploaded the report, check Files tab!")
        page1.click(".composer button")
        page2.click("button:has-text('Messages')")
        page2.wait_for_selector("text=Uploaded the report, check Files tab!", timeout=10000)
        print("Chat still works fine alongside the new Files tab.")

        # =========== CALENDAR ===========
        page1.click("a:has-text('Calendar')")
        page1.wait_for_selector("text=Marketing", timeout=10000)
        print("User1 opened the Calendar page.")

        # Event creation now lives behind a "+ New event" modal instead of an
        # always-visible inline form.
        page1.click("button:has-text('+ New event')")
        page1.wait_for_selector(".event-form", timeout=10000)
        page1.fill(".event-form input >> nth=0", "Q4 Planning Session")
        page1.fill(".event-form input >> nth=1", "Review Q4 goals and budget")
        page1.click("button:has-text('Schedule')")
        page1.wait_for_selector("text=Q4 Planning Session", timeout=10000)
        print("User1 scheduled an event for the team.")

        # User2 should see the same event on the same team's calendar
        page2.click("a:has-text('Calendar')")
        page2.wait_for_selector("text=Marketing", timeout=10000)
        page2.wait_for_selector("text=Q4 Planning Session", timeout=10000)
        page2.wait_for_selector("text=Scheduled by Priya Lead", timeout=10000)
        print("User2 sees the same event on the shared team calendar.")
        page2.screenshot(path="/home/claude/teamspace/screenshot_calendar.png", full_page=True)

        # User2 should NOT have a delete button on an event they didn't create
        delete_buttons_for_user2 = page2.locator(".event-row:has-text('Q4 Planning Session') button:has-text('Delete')")
        assert delete_buttons_for_user2.count() == 0, "A non-creator should not see a delete button!"
        print("User2 correctly has no delete button on an event they didn't create.")

        # User1 (the creator) deletes it
        page1.click(".event-row:has-text('Q4 Planning Session') button:has-text('Delete')")
        page1.wait_for_selector("text=No events scheduled for this team yet.", timeout=10000)
        print("User1 deleted their own event; list is empty again.")

        page2.reload()
        page2.wait_for_selector("text=Marketing", timeout=10000)
        page2.wait_for_selector("text=No events scheduled for this team yet.", timeout=10000)
        print("After reload, User2 also sees the event is gone -- deletion really persisted.")

        browser.close()
        os.remove(upload_path)
        os.remove(downloaded_path)
        print("PHASE 3 E2E TEST PASSED")


run()
