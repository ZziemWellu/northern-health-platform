# Demo script: five minutes, with what is real and what is not

**Before you start:** say the status first. "Nothing here is clinically approved. Every module shows its
status on screen. The demo uses made-up people."

## 1. Status board (1 minute)

Open `prototype/index.html`. Point to the banner, then the module table: every module reads "NOT APPROVED".
Say: "This page reads its statuses from the project's files. It cannot show an approval that does not exist."

## 2. Referral to a facility (1 minute)

Open the mobile app: https://mama-ai-pwa.onrender.com . Go to the referral screen. Allow location, or
accept the default. Show the nearest facility from the list of real facilities.
Say: "The app ranks real facilities. If location is unavailable it says so, and does not guess."
**Warning:** the free server sleeps after inactivity and can take about 40 seconds to wake. Open the page
a minute before you present.

## 3. Household record and referral, end to end (2 minutes)

Run in a terminal (local MAMA-AI instance running on port 8001, demo user registered):

    MAMA_URL=http://localhost:8001 MAMA_PHONE=0244000111 MAMA_PASSWORD=demo-password-1 \
      node shared/household_link/demo/link_demo.js

Point to the output: one platform ID; the patient code is that ID, not a name; a risk flag with one short
reason and no phone number; a referral recommendation from the real facility list.
Say: "The household record holds references, not names. A flag goes to the referral module without re-entry."

## 4. The district file (1 minute)

Open `docs/pitch/example_module5_export_2026Q2_SYNTHETIC.csv`. Point out the DHIS2 layout and that one
count is withheld because it is under five.
Say: "This file is what a district imports. It has counts only, and it is not sent anywhere automatically.
The data-element IDs are from DHIS2's public demo; ours come from the Ghana Health Service."

## What not to claim

- No outcome, lives-saved or cost-saving figures. None exist yet.
- No clinical approval, district agreement or GHS endorsement.
- No live SMS or voice; speech recognition is off.
- No free hosting for real data.

## If something fails

Say what failed and show the status board. A demo that admits its limits is more credible than one that hides them.
