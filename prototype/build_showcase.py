"""Builds prototype/index.html: a stakeholder showcase of the MVP that is labelled as unreviewed.

Every status shown is read from the repository, not typed in:
  - module sign-off from clinical_signoff.json (all unapproved unless a named reviewer signed them)
  - feeding plans from nutrition/plans/plans.json (drafts)
  - voice replies from voice/replies.json (PILOT wording)
The referral demo runs the same rules as referral_arrival/arrival.js in the browser; test_showcase.py
checks the banners and statuses, and the rules are covered by referral_arrival/test.

Run: python prototype/build_showcase.py
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "index.html"

BANNER = ("UNREVIEWED PROTOTYPE. Not for patient care. No clinical content in this build has been approved "
          "by a clinical advisor, a nutritionist, the Ghana Health Service or any district. Every status below "
          "is read from the project's own sign-off records.")


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def module_rows(signoff):
    rows = []
    for num, m in sorted(signoff["modules"].items(), key=lambda kv: int(kv[0])):
        state = "Approved" if (m.get("approved") and m.get("by") and m.get("on")) else "NOT APPROVED"
        forms = [f for f, mod in signoff["forms"].items() if mod == num]
        rows.append(f"<tr><td>{html.escape(num)}</td><td>{html.escape(m['name'])}</td>"
                    f"<td class='st-{'ok' if state == 'Approved' else 'no'}'>{state}</td>"
                    f"<td>{html.escape(', '.join(forms)) or '-'}</td></tr>")
    return "\n".join(rows)


def plan_rows(plans):
    rows = []
    for p in plans:
        problems = ", ".join(n.replace("_mg", "").replace("_mcg_rae", "").replace("_", " ")
                             for n in p.get("problem_nutrients", [])) or "none"
        foods = "; ".join(f"{p['foods'][k]} {g} g" for k, g in p["grams_per_day"].items())
        rows.append(f"<tr><td>{html.escape(p['id'])}</td><td>{html.escape(p['age_label'])}</td>"
                    f"<td>{html.escape(foods)}</td><td>{html.escape(problems)}</td>"
                    f"<td class='st-no'>DRAFT, not approved</td></tr>")
    return "\n".join(rows)


def reply_cards(replies):
    cards = []
    for intent, r in replies["replies"].items():
        cards.append(f"<div class='card'><h4>{html.escape(intent)}</h4><p>{html.escape(r['en'])}</p>"
                     f"<p class='small'>Twi (first draft, not checked by a Twi speaker): {html.escape(r['tw'])}</p>"
                     f"<span class='pill no'>PILOT wording, not approved</span></div>")
    return "\n".join(cards)


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Community Health Platform: unreviewed MVP showcase</title>
<style>
:root { --ink:#1b1f24; --muted:#5b6470; --bg:#f6f7f9; --card:#fff; --line:#d9dde3; --no:#b42318; --ok:#067647; --warn:#fff4e5; --warnline:#f5a524; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ink:#e8eaed; --muted:#a6adb7; --bg:#15181c; --card:#1e2227; --line:#343a42; --warn:#3a2d12; } }
:root[data-theme="dark"] { --ink:#e8eaed; --muted:#a6adb7; --bg:#15181c; --card:#1e2227; --line:#343a42; --warn:#3a2d12; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui, Segoe UI, Roboto, sans-serif; }
main { max-width:1000px; margin:0 auto; padding:16px; }
.banner { background:var(--warn); border:2px solid var(--warnline); border-radius:10px; padding:14px 16px; font-weight:600; }
h1 { font-size:1.6rem; margin:18px 0 6px; } h2 { font-size:1.25rem; margin-top:28px; border-bottom:1px solid var(--line); padding-bottom:4px; }
table { width:100%; border-collapse:collapse; background:var(--card); font-size:.95rem; }
th, td { text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; }
.st-no { color:var(--no); font-weight:600; } .st-ok { color:var(--ok); font-weight:600; }
.pill { display:inline-block; font-size:.8rem; padding:2px 8px; border-radius:999px; border:1px solid var(--line); }
.pill.no { color:var(--no); border-color:var(--no); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; }
.small { color:var(--muted); font-size:.9rem; }
.demo { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px; }
button, input, select { font:inherit; padding:8px 10px; margin:4px 4px 4px 0; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--ink); }
button { cursor:pointer; }
pre { background:var(--bg); padding:10px; border-radius:8px; white-space:pre-wrap; overflow-wrap:anywhere; }
@media (max-width:600px) { main { padding:12px; } table { font-size:.85rem; } }
</style></head>
<body><main>
<div class="banner" role="alert">__BANNER__</div>
<h1>Community health platform, MVP showcase</h1>
<p class="small">Northern Ghana. Built on the Community Health Toolkit. Status of every module and plan is shown below.
This page does not approve anything.</p>

<h2>1. Module sign-off status</h2>
<p class="small">Read from clinical_signoff.json. A module shows as approved only when a named reviewer has signed it.</p>
<div style="overflow-x:auto"><table>
<thead><tr><th>Module</th><th>Name</th><th>Sign-off</th><th>Forms</th></tr></thead>
<tbody>__MODULES__</tbody></table></div>

<h2>2. Module 2: referral arrival loop (demo)</h2>
<p class="small">Same rules as referral_arrival/arrival.js: deadline by urgency, a code the facility must enter, five wrong
codes lock a referral, and an overdue referral escalates once. SMS is never sent from this page.</p>
<div class="demo">
  <label>Urgency <select id="urg"><option value="emergency">emergency (1 day)</option><option value="urgent" selected>urgent (2 days)</option><option value="routine">routine (7 days)</option></select></label>
  <button id="create">Create referral</button>
  <label>Facility ID <select id="fac"><option>F1</option><option>F2</option></select></label>
  <label>Code <input id="code" size="8" maxlength="6" placeholder="6 letters"></label>
  <button id="confirm">Facility confirms arrival</button>
  <label>Days later <input id="days" type="range" min="0" max="10" value="0"> <span id="dayval">0</span></label>
  <button id="check">Check escalation</button>
  <pre id="log">No referral yet.</pre>
</div>

<h2>3. Module 3: feeding plans (drafts)</h2>
<p class="small">Read from nutrition/plans/plans.json. Plans are drafts. The app shows only approved plans, and none are approved.</p>
<div style="overflow-x:auto"><table>
<thead><tr><th>Plan</th><th>Age</th><th>Foods per day</th><th>Nutrients local foods cannot meet</th><th>Status</th></tr></thead>
<tbody>__PLANS__</tbody></table></div>

<h2>4. Module 4: caregiver voice replies (menu-first)</h2>
<p class="small">Read from voice/replies.json. The CHW picks the topic on the phone; the approved reply appears offline. No speech recognition is used.</p>
<div class="grid">__REPLIES__</div>

<h2>5. What is needed before any of this can be used</h2>
<ul>
<li>A named clinical advisor signs each module (section 1).</li>
<li>A nutritionist approves or rejects each plan (section 3).</li>
<li>A Twi speaker and a health worker check each voice reply (section 4).</li>
<li>The Ghana Health Service protocol governs the postnatal schedule (National Safe Motherhood Protocol: at least three visits, within 48 hours, day 6 or 7, and 6 weeks).</li>
<li>A district agrees in writing to the paper registers it retires. Ethics review and Data Protection Commission registration come before any real data.</li>
</ul>
<p class="small">Source of this page: prototype/build_showcase.py. Regenerate after any change to the files it reads.</p>
</main>
<script>
(function () {
  var RULES = { days: { emergency: 1, urgent: 2, routine: 7 }, maxAttempts: 5 };
  var ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var ref = null;
  var now = new Date();
  var log = document.getElementById('log');
  function say(s) { log.textContent = s; }
  function newCode() {
    var out = '';
    for (var i = 0; i < 6; i++) out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return out;
  }
  function at(days) { return new Date(now.getTime() + days * 86400000); }
  document.getElementById('dayval').textContent = '0';
  document.getElementById('days').addEventListener('input', function (e) {
    document.getElementById('dayval').textContent = e.target.value;
  });
  document.getElementById('create').addEventListener('click', function () {
    var u = document.getElementById('urg').value;
    now = new Date();
    ref = { code: newCode(), urgency: u, facility: document.getElementById('fac').value,
            deadline: at(RULES.days[u]), arrived: null, failed: 0, escalated: false };
    say('Referral created (urgency ' + u + ').\\nSMS to facility (not sent in this demo): ZZ REF ' + ref.code +
        '. Confirm arrival by ' + ref.deadline.toISOString().slice(0, 10) + '.\\nThe nurse view never shows the code.');
  });
  document.getElementById('confirm').addEventListener('click', function () {
    if (!ref) return say('Create a referral first.');
    if (ref.arrived) return say('Already confirmed. Confirming twice is harmless.');
    if (ref.failed >= RULES.maxAttempts) return say('Locked after too many wrong codes.');
    if (document.getElementById('fac').value !== ref.facility) return say('Not this facility.');
    var code = document.getElementById('code').value.trim().toUpperCase();
    if (code !== ref.code) { ref.failed++; return say('Wrong code (' + ref.failed + ' of ' + RULES.maxAttempts + ').'); }
    ref.arrived = new Date(); say('Arrival confirmed.');
  });
  document.getElementById('check').addEventListener('click', function () {
    if (!ref) return say('Create a referral first.');
    var d = parseInt(document.getElementById('days').value, 10);
    var t = at(d);
    if (ref.arrived) return say('Arrived. Never escalates.');
    if (t.getTime() <= ref.deadline.getTime()) return say('Day ' + d + ': before the deadline. No escalation.');
    if (ref.escalated) return say('Day ' + d + ': already escalated once.');
    ref.escalated = true;
    say('Day ' + d + ': overdue. Escalation to the CHPS nurse (not sent in this demo): trace the woman.');
  });
})();
</script>
</body></html>
"""


def build():
    signoff = load("clinical_signoff.json")
    plans = load("nutrition/plans/plans.json")["plans"]
    replies = load("voice/replies.json")
    page = (PAGE.replace("__BANNER__", html.escape(BANNER))
            .replace("__MODULES__", module_rows(signoff))
            .replace("__PLANS__", plan_rows(plans))
            .replace("__REPLIES__", reply_cards(replies)))
    OUT.write_text(page, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    print(f"wrote {build()}")
