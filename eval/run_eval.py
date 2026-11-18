"""Scenario evaluation: original Campus Stores vs. the partial-return prototype.

Each scenario replays the Film Society shift with one thing going differently
(wrong adapter, someone else returns it, the evening worker skips a step...).
The same simulated counter worker runs it on both versions, and the script
checks the app's records against what physically happened.

The simulated worker is honest but busy: they check exactly what the screen
asks them to check, and nothing else. In the original app that means they
never compare a unit's label with the slip, because nothing asks them to.
That assumption favours the prototype, so it is stated in the README and
should be tested at a real counter.

Usage (from the repository folder):
    pip install playwright && python -m playwright install chromium
    python eval/run_eval.py                # baseline = upstream commit aeeba26
    python eval/run_eval.py --baseline DIR # or any folder with the original app
"""

import argparse
import json
import pathlib
import subprocess
import sys
import tarfile
import tempfile

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent.parent
BASELINE_COMMIT = "aeeba26"
KIT = [("PR-04", "Fri 8 pm"), ("SP-02", "Fri 8 pm"), ("AD-12", "Fri 8 pm")]


class Driver:
    def __init__(self, page, folder):
        self.pg = page
        self.pg.goto((folder / "index.html").as_uri())
        self.pg.evaluate("localStorage.clear()")
        self.pg.reload()

    def tab(self, name):
        self.pg.click(f'nav [data-val="{name}"]')

    def advance(self):
        self.pg.click('[data-action="advance"]')

    def issue(self, asset, who="Kabir Sen", due="Fri 8 pm"):
        self.tab("Loan register")
        self.pg.click('[data-action="new"]')
        self.pg.select_option("select[name=req]", "RQ-214")
        self.pg.select_option("select[name=asset]", asset)
        self.pg.select_option("select[name=who]", who)
        self.pg.select_option("select[name=due]", due)
        self.pg.click("form[data-issue] button[type=submit]")

    def slip_row(self, asset):
        return (
            self.pg.locator(".row", has_text=f"· {asset}")
            .filter(has=self.pg.locator('[data-action="return"]'))
            .first
        )

    def state(self):
        for key in ("campus-stores.shift.v2", "campus-stores.shift.v1"):
            raw = self.pg.evaluate(f"localStorage.getItem('{key}')")
            if raw:
                return json.loads(raw)
        return {}

    def open_loans(self):
        for key in ("campus-stores.shift.v2", "campus-stores.shift.v1"):
            raw = self.pg.evaluate(f"localStorage.getItem('{key}')")
            if raw:
                return json.loads(raw)["loans"]
        return []

    def out_set(self):
        return {l["asset"] for l in self.open_loans() if not l["back"]}

    def register_text(self):
        self.tab("Loan register")
        return self.pg.inner_text("[data-page]")

    saw_alert = False

    def alert_shown(self):
        return self.pg.locator('[role="alert"]').count() > 0


class Original(Driver):
    name = "Original"

    def return_present(self, asset, by):
        # The screen asks nothing, so the worker just closes the slip.
        self.tab("Loan register")
        self.slip_row(asset).locator('[data-action="return"]').click()

    def still_out(self, asset, holder, promised, why):
        # Best the original allows: a free-text note in the Desk book.
        self.tab("Desk book")
        self.pg.fill("textarea[name=note]", f"{holder} has {asset}. Back {promised}. {why}")
        self.pg.click("form[data-note] button")

    def misclick(self, asset):
        self.return_present(asset, None)

    def undo(self, asset, why):
        # No undo in the original: the best a worker can do is leave a note.
        self.tab("Desk book")
        self.pg.fill("textarea[name=note]", f"{asset} slip closed by mistake. {why}")
        self.pg.click("form[data-note] button")

    def hand_in(self, unit, by, expected_asset, condition="Working"):
        # The worker closes the open slip for the item the person says they are
        # returning. Nothing on screen asks them to compare the label.
        self.tab("Loan register")
        row = self.slip_row(expected_asset)
        if row.count():
            row.locator('[data-action="return"]').click()
        return False  # cannot record condition or who handed it in


class Prototype(Driver):
    name = "Prototype"

    def _close_from_panel(self, by, unit_in_hand, condition="Working", note=""):
        label = self.pg.inner_text("form[data-return] .tick")
        if unit_in_hand not in label:
            # The screen asks for the label; it does not match, so stop.
            self.pg.click('[data-action="cancel"]')
            return
        self.pg.select_option("form[data-return] select[name=by]", by)
        self.pg.check("form[data-return] input[name=label]")
        self.pg.select_option("form[data-return] select[name=cond]", condition)
        if note:
            self.pg.fill("form[data-return] input[name=condnote]", note)
        self.pg.click("form[data-return] button")

    def return_present(self, asset, by):
        self.tab("Loan register")
        self.pg.click('[data-action="checkin"]')
        self.pg.click(f'[data-action="inhand"][data-val="{asset}"]')
        self._close_from_panel(by, asset)

    def still_out(self, asset, holder, promised, why):
        self.tab("Loan register")
        self.slip_row(asset).locator('[data-action="return"]').click()
        self.pg.select_option("form[data-still] select[name=holder]", holder)
        self.pg.select_option("form[data-still] select[name=promised]", promised)
        self.pg.fill("form[data-still] [name=why]", why)
        self.pg.click("form[data-still] button[type=submit]")

    def misclick(self, asset):
        # Opens the return screen; it asks for the label of the unit in hand.
        # There is no unit in hand, so an honest worker backs out.
        self.tab("Loan register")
        self.slip_row(asset).locator('[data-action="return"]').click()
        self._close_from_panel("Kabir Sen", unit_in_hand="(nothing)")

    def undo(self, asset, why):
        self.tab("Loan register")
        self.pg.click('[data-action="scope"][data-val="1"]')
        row = self.pg.locator(".row", has_text=f"· {asset}").filter(
            has=self.pg.locator('[data-action="undo"]')
        ).first
        row.locator('[data-action="undo"]').click()

    def hand_in(self, unit, by, expected_asset, condition="Working"):
        self.tab("Loan register")
        self.pg.click('[data-action="checkin"]')
        if unit == "OWN":
            # A personal adapter has no desk label, so nothing in the list matches.
            self.pg.click('[data-action="cancel"]')
            return False
        self.pg.click(f'[data-action="inhand"][data-val="{unit}"]')
        self.saw_alert = self.alert_shown()
        fix = self.pg.locator("form[data-fix]")
        if fix.count() and self.shelf_has(expected_asset):
            # The screen asks the worker to check the bin; they look and the
            # slip's unit really is there, so they correct the slip.
            fix.locator("input[name=shelf]").check()
            fix.locator("button").click()
        if self.pg.locator("form[data-return]").count():
            self._close_from_panel(by, unit, condition, "bent HDMI connector" if condition != "Working" else "")
        return None

    shelf_has = staticmethod(lambda asset: False)


def pickup(d):
    for asset, due in KIT:
        d.issue(asset, due=due)


def evening(d, skip_handover=False, misclick=False):
    d.advance()
    d.return_present("PR-04", "Kabir Sen")
    d.return_present("SP-02", "Kabir Sen")
    if misclick:
        d.misclick("AD-12")
    if not skip_handover:
        d.still_out("AD-12", "Leela Das", "Sat 9 am", "Took it home after the screening")


# Each scenario returns {check name: passed?}. `truth` is the set of desk units
# physically outside the desk at that moment.
def s1_happy(d):
    pickup(d); evening(d)
    night_ok = d.out_set() == {"MI-09", "AD-12"}
    d.advance()
    reg = d.register_text()
    holder = "Leela Das" in reg
    d.hand_in("AD-12", "Leela Das", "AD-12")
    return {
        "Records correct overnight": night_ok,
        "Morning register shows who has it": holder,
        "Right slip closed": d.out_set() == {"MI-09"},
    }


def s2_own_adapter(d):
    pickup(d); evening(d)
    d.advance()
    d.hand_in("OWN", "Leela Das", "AD-12")
    return {
        "Personal adapter not taken as ours": "AD-12" in d.out_set(),
    }


def s3_someone_else(d):
    pickup(d); evening(d)
    d.advance()
    d.hand_in("AD-12", "Isha Rao", "AD-12")
    loans = {l["asset"]: l for l in d.open_loans()}
    return {
        "Right slip closed": d.out_set() == {"MI-09"},
        "Records who actually handed it in": loans["AD-12"].get("returnedBy") == "Isha Rao",
    }


def s4_skipped_handover(d):
    pickup(d); evening(d, skip_handover=True)
    d.advance()
    reg = d.register_text()
    d.hand_in("AD-12", "Leela Das", "AD-12")
    return {
        "Morning register flags it as late": "Overdue" in reg,
        "Morning register shows who has it": "Leela Das" in reg,
        "Right slip closed": d.out_set() == {"MI-09"},
    }


def s5_damaged(d):
    pickup(d); evening(d)
    d.advance()
    d.hand_in("AD-12", "Leela Das", "AD-12", condition="Damaged")
    st = d.state()
    loan = next(l for l in st["loans"] if l["asset"] == "AD-12")
    return {
        "Damage recorded on return": loan.get("condition") == "Damaged",
        "Damaged unit kept out of the next issue": "AD-12" in st.get("flags", {}),
    }


def s6_bin_mixup(d):
    # Pickup slip says AD-12, but Kabir was physically handed AD-15 from bin C4.
    pickup(d); evening(d)
    d.advance()
    d.shelf_has = lambda asset: asset == "AD-12"  # physically true in this scenario
    d.hand_in("AD-15", "Leela Das", "AD-12")
    surfaced = d.saw_alert
    # Truth if the worker takes AD-15 in: nothing is out except the mic.
    # Truth if the worker refuses: AD-15 is still with Leela.
    took_it = "AD-12" not in d.out_set()
    truth = {"MI-09"} if took_it else {"MI-09", "AD-15"}
    return {
        "Mismatch between slip and unit surfaced": surfaced,
        "Records correct at end": d.out_set() == truth,
    }


def s7_misclick(d):
    pickup(d); evening(d, misclick=True)
    night_ok = d.out_set() == {"MI-09", "AD-12"}
    return {
        "Records correct overnight": night_ok,
    }


def s9_empty_case(d):
    # Kabir hands in the adapter's case, labelled AD-12. The worker checks the
    # label and closes the slip. Opening the case, it is empty: Leela has the
    # adapter. The mistake is discovered a minute later.
    pickup(d)
    d.advance()
    d.return_present("PR-04", "Kabir Sen")
    d.return_present("SP-02", "Kabir Sen")
    d.return_present("AD-12", "Kabir Sen")
    d.undo("AD-12", "Case was empty. Leela Das has the adapter, back Sat 9 am.")
    return {"Records correct overnight": d.out_set() == {"MI-09", "AD-12"}}


def s8_control(d):
    # Control: Tara returns the mic at 9 am alongside Leela. Both should pass.
    pickup(d); evening(d)
    d.advance()
    d.hand_in("AD-12", "Leela Das", "AD-12")
    d.hand_in("MI-09", "Tara Shah", "MI-09")
    return {"Both slips closed": d.out_set() == set()}


SCENARIOS = [
    ("S1", "Leela returns the adapter at 9 am", s1_happy),
    ("S2", "Leela hands in her own look-alike adapter", s2_own_adapter),
    ("S3", "Isha returns it instead of Leela", s3_someone_else),
    ("S4", "Evening worker skips the handover step", s4_skipped_handover),
    ("S5", "Adapter comes back with a bent connector", s5_damaged),
    ("S6", "Wrong adapter was handed out at pickup", s6_bin_mixup),
    ("S7", "Evening worker clicks Record return on the adapter by mistake", s7_misclick),
    ("S8", "Control: mic and adapter both returned", s8_control),
    ("S9", "An empty case labelled AD-12 is checked in, then noticed", s9_empty_case),
]


def baseline_dir(arg):
    if arg:
        return pathlib.Path(arg).resolve()
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="campus-baseline-"))
    data = subprocess.run(
        ["git", "-C", str(HERE), "archive", BASELINE_COMMIT],
        check=True, capture_output=True,
    ).stdout
    tar_path = tmp / "b.tar"
    tar_path.write_bytes(data)
    with tarfile.open(tar_path) as t:
        t.extractall(tmp, filter="data")
    return tmp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline")
    ap.add_argument("--json", help="write raw results here")
    args = ap.parse_args()
    folders = {Original: baseline_dir(args.baseline), Prototype: HERE}
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for sid, title, fn in SCENARIOS:
            row = {"id": sid, "title": title, "checks": {}}
            for cls, folder in folders.items():
                page = browser.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                checks = fn(cls(page, folder))
                if errors:
                    sys.exit(f"{cls.name} {sid}: page error {errors}")
                for k, v in checks.items():
                    row["checks"].setdefault(k, {})[cls.name] = bool(v)
                page.close()
            results.append(row)
        browser.close()

    totals = {"Original": 0, "Prototype": 0}
    n = 0
    lines = ["| Scenario | Check | Original | Prototype |", "|---|---|:---:|:---:|"]
    for r in results:
        for k, v in r["checks"].items():
            n += 1
            for name in totals:
                totals[name] += v[name]
            mark = lambda b: "✅" if b else "❌"
            lines.append(f"| {r['id']} · {r['title']} | {k} | {mark(v['Original'])} | {mark(v['Prototype'])} |")
    lines.append(f"| **Total** | | **{totals['Original']}/{n}** | **{totals['Prototype']}/{n}** |")
    print("\n".join(lines))
    if args.json:
        pathlib.Path(args.json).write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
