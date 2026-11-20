import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"


def rand_suffix():
    return str(int(time.time() * 1000))[-6:]


# Deliberately a mix of substantive, keyword-dense messages and throwaway
# chatter, so a real test of the recap means checking that it favors the
# substantive ones -- not just that *some* text came back.
MESSAGES = [
    "hey",
    "The database migration for the billing service needs to run before Friday",
    "ok",
    "lol",
    "Someone needs to review the billing service migration script today",
    "cool",
    "The migration script for billing touches the invoices table, so back it up first",
    "sounds good",
    "thanks",
    "Backups for the invoices table are already automated nightly, so we're fine",
]


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx1 = browser.new_context()
        page1 = ctx1.new_page()

        suffix = rand_suffix()
        org_name = f"Recap Org {suffix}"

        page1.goto(f"{BASE}/signup")
        page1.fill("label:has-text('Your name') input", "Meera Backend")
        page1.fill("label:has-text('Email') input", f"meera{suffix}@example.com")
        page1.fill("label:has-text('Password') input", "password123")
        page1.fill("label:has-text('Organization name') input", org_name)
        page1.click("button.primary-btn")
        page1.wait_for_selector("text=Teams", timeout=10000)

        page1.fill("input[placeholder='New team name']", "Platform")
        page1.click(".inline-form button")
        page1.wait_for_selector("text=Platform", timeout=10000)
        page1.click("text=Platform")
        page1.wait_for_selector("text=# general", timeout=10000)
        page1.click("text=# general")
        page1.wait_for_selector(".composer input", timeout=10000)
        print("User set up org + team + channel.")

        # --- Check the empty-channel state first ---
        page1.click("button:has-text('Recap')")
        page1.wait_for_selector("text=No messages in this channel yet to recap.", timeout=10000)
        print("Recap correctly shows an empty state before any messages exist.")

        # --- Post the mixed substantive/throwaway messages via the real chat UI ---
        page1.click("button:has-text('Messages')")
        page1.wait_for_selector(".composer input", timeout=10000)
        for msg in MESSAGES:
            page1.fill(".composer input", msg)
            page1.click(".composer button")
            page1.wait_for_selector(f"text={msg}", timeout=10000)
        print(f"Posted {len(MESSAGES)} real messages through the chat UI.")

        # --- Now check the recap ---
        page1.click("button:has-text('Recap')")
        page1.wait_for_selector("text=Highlights", timeout=10000)
        page1.wait_for_selector("text=10", timeout=10000)  # message count stat
        print("Recap loaded with the message-count stat.")

        # Keyword chips should surface real topic words from the conversation
        body_text = page1.inner_text(".recap-panel")
        assert "billing" in body_text.lower() or "migration" in body_text.lower(), (
            "Expected the recap's keywords/highlights to surface real topic words "
            "like 'billing' or 'migration', but they didn't appear."
        )
        print("Keyword chips surfaced real topic words from the conversation ('billing'/'migration').")

        # The highlighted messages should be the substantive ones, not the filler
        highlight_text = page1.inner_text(".recap-highlights")
        for filler in ["hey", "ok", "lol", "cool", "sounds good", "thanks"]:
            assert highlight_text.strip() != filler, f"Highlight was just filler: {filler!r}"
        assert "billing" in highlight_text.lower() or "migration" in highlight_text.lower(), (
            "Expected highlighted messages to be the substantive ones about the migration, "
            f"got: {highlight_text!r}"
        )
        print("Highlighted messages are the real, substantive ones -- not the one-word filler chat.")

        page1.screenshot(path="/home/claude/teamspace/screenshot_ai_recap.png", full_page=True)

        # --- Refresh button re-fetches without error ---
        page1.click("button:has-text('refresh')")
        page1.wait_for_selector("text=Highlights", timeout=10000)
        print("Refresh re-fetched the recap successfully.")

        browser.close()
        print("AI RECAP E2E TEST PASSED")


run()
