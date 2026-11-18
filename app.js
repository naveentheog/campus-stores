(() => {
  const storageKey = "campus-stores.shift.v2";
  const root = document.getElementById("campus-stores");
  const q = (selector) => root.querySelector(selector);
  const requests = [
    {
      id: "RQ-214",
      club: "Film Society",
      event: "Courtyard screening",
      owner: "Isha Rao",
      due: "Fri 8 pm",
      items: ["HDMI projector", "Portable speaker", "USB-C → HDMI adapter"],
      note: "Playback is from a USB-C-only laptop. The host will collect at 4 pm.",
    },
    {
      id: "RQ-209",
      club: "Debate Union",
      event: "Finals rehearsal",
      owner: "Tara Shah",
      due: "Sat 10 am",
      items: ["Wireless microphone"],
      note: "Rehearsal runs into the evening.",
    },
    {
      id: "RQ-217",
      club: "Photo Circle",
      event: "Street portrait walk",
      owner: "Dev Menon",
      due: "Sat noon",
      items: ["Digital camera"],
      note: "Collection on Saturday morning.",
    },
  ];
  const assets = [
    { id: "PR-04", type: "HDMI projector", model: "BenQ MH550", bin: "A2" },
    {
      id: "PR-06",
      type: "HDMI projector",
      model: "Epson EB-X49",
      bin: "Workshop",
      repair: true,
    },
    { id: "SP-02", type: "Portable speaker", model: "JBL Eon One", bin: "B1" },
    { id: "SP-05", type: "Portable speaker", model: "Bose S1", bin: "B2" },
    {
      id: "AD-12",
      type: "USB-C → HDMI adapter",
      model: "Belkin AVC002",
      bin: "C4",
    },
    {
      id: "AD-15",
      type: "USB-C → HDMI adapter",
      model: "Anker A8312",
      bin: "C4",
    },
    { id: "MI-09", type: "Wireless microphone", model: "Shure BLX", bin: "B3" },
    { id: "CA-03", type: "Digital camera", model: "Sony A6400", bin: "D2" },
  ];
  const people = [
    "Isha Rao",
    "Kabir Sen",
    "Leela Das",
    "Tara Shah",
    "Dev Menon",
  ];
  const shifts = [
    {
      time: "Friday · 3:45 pm",
      title: "Pickup at the counter",
      text: "Kabir is here for the Film Society screening. The film starts at four. Can he leave with everything he needs?",
      next: "Move to return time",
    },
    {
      time: "Friday · 7:30 pm",
      title: "The kit comes back in pieces",
      text: "Kabir has brought back the projector and speaker. “Leela still has the adapter. She’ll drop it off tomorrow at nine.” Take the return and hand over to the morning shift.",
      next: "Move to next morning",
    },
    {
      time: "Saturday · 9:00 am",
      title: "Morning shift",
      text: "You’ve just taken over. Leela walks in with an adapter. Work out what was outstanding from the screening and close the loan for the right item.",
    },
  ];
  // Minutes since Friday 00:00, so due and promised times can be compared with
  // the desk clock. Used to flag what is overdue or expected at the counter now.
  const clockAt = [945, 1170, 1980];
  const times = { "Fri 8 pm": 1200, "Sat 9 am": 1980, "Sat 10 am": 2040, "Sat noon": 2160 };
  const timeList = Object.keys(times);
  const pages = [
    ["Requests", "clipboard-list"],
    ["Inventory", "package"],
    ["Loan register", "book-open"],
    ["Desk book", "messages-square"],
    ["Shift metrics", "activity"],
  ];
  // A slip now records custody, not just a signature: `who` signed for the
  // unit, `holder` has it right now, `promised` is the latest agreed return
  // time, and `log` is the slip's own history.
  const slip = (l) => ({
    holder: l.who,
    promised: "",
    log: [],
    returnedBy: "",
    returnedAt: -1,
    condition: "",
    holderOk: true,
    ...l,
  });
  const original = () => ({
    version: 2,
    tab: "Requests",
    phase: 0,
    selected: "",
    filter: "All items",
    loans: [
      slip({
        num: 401,
        req: "RQ-209",
        asset: "MI-09",
        who: "Tara Shah",
        due: "Sat 10 am",
        back: false,
        log: [{ phase: 0, text: "Signed out to Tara Shah. Due Sat 10 am." }],
      }),
    ],
    notes: [],
    editing: false,
    returning: 0,
    checkin: false,
    alert: "",
    mismatch: null,
    draft: null,
    flags: {},
    acks: {},
    openedAt: 0,
    metrics: [],
    onlyOpen: true,
    notice: "Sample shift · All records are fictional.",
  });
  let s = original();
  const getAsset = (id) => assets.find((x) => x.id === id);
  const getReq = (id) => requests.find((x) => x.id === id);
  const out = (id) => s.loans.find((l) => l.asset === id && !l.back);
  const unitLabel = (id) => {
    const a = getAsset(id);
    return a.id + " · " + a.model + " (" + a.type + ")";
  };
  // Look-alike guard, borrowed from "tall man" lettering for look-alike drug
  // names: when two units of the same type share a bin, show the parts that
  // tell them apart (number and brand) in capitals wherever they appear.
  const lookalikes = (id) => {
    const a = getAsset(id);
    return assets.filter((x) => x.id !== id && x.type === a.type && x.bin === a.bin);
  };
  const tall = (id) => {
    const a = getAsset(id);
    if (!lookalikes(id).length) return esc(a.id + " · " + a.model);
    const [pre, num] = a.id.split("-");
    const [brand, ...rest] = a.model.split(" ");
    return (
      esc(pre) + '-<b class="tall">' + esc(num) + '</b> · <b class="tall">' +
      esc(brand.toUpperCase()) + "</b> " + esc(rest.join(" "))
    );
  };
  const tellApart = (id) => {
    const la = lookalikes(id);
    if (!la.length) return "";
    const a = getAsset(id);
    return (
      '<p class="lookalike"><b>Look-alike in bin ' + esc(a.bin) + ":</b> " +
      la.map((x) => tall(x.id)).join(", ") +
      ". Check the number <i>and</i> the brand, not just the type.</p>"
    );
  };
  const firstName = (p) => p.split(" ")[0];
  const holderMessage = (l) => {
    const a = getAsset(l.asset);
    const r = getReq(l.req);
    return (
      "Hi " + firstName(l.holder) + ", this is the Campus Stores media desk. " +
      firstName(l.who) + " told us you have our " + a.type + " (" + a.id + " · " + a.model +
      ") from the " + r.club + " " + r.event.toLowerCase() + ". Please bring it to the desk by " +
      expected(l) + ". Reply YES if that's right, or tell us who has it."
    );
  };
  const expected = (l) => l.promised || l.due;
  // Timing of an open slip against the desk clock.
  const timing = (l) => {
    const diff = times[expected(l)] - clockAt[s.phase];
    if (diff < 0) return ["Overdue · was due " + expected(l), "late"];
    if (diff === 0) return ["Expected now", "now"];
    return ["Due " + expected(l), ""];
  };
  // Prototype instrumentation: the numbers I would want from a real counter.
  const track = (kind, extra = {}) =>
    s.metrics.push({ kind, phase: s.phase, at: Date.now(), ...extra });
  const viewsSinceLast = () => {
    let n = 0;
    for (let i = s.metrics.length - 1; i >= 0; i--) {
      const k = s.metrics[i].kind;
      if (k === "closed" || k === "kept-open" || k === "shift-start") break;
      if (k === "view") n++;
    }
    return n;
  };
  const tagged = (t, style) =>
    '<span class="tag ' + style + '">' + esc(t) + "</span>";
  const esc = (x) =>
    String(x).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const opts = (list) =>
    list
      .map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + "</option>")
      .join("");
  const btn = (label, act, val = "", style = "") =>
    '<button type="button" data-action="' +
    act +
    '" data-val="' +
    esc(val) +
    '" class="' +
    style +
    '">' +
    esc(label) +
    "</button>";
  const head = (title, sub, control = "") =>
    '<div class="sectionhead"><div><h2>' +
    title +
    "</h2><small>" +
    sub +
    "</small></div>" +
    control +
    "</div>";
  const row = (label, sub, right) =>
    '<div class="row"><div><strong>' +
    esc(label) +
    "</strong><small>" +
    esc(sub) +
    "</small></div><div>" +
    right +
    "</div></div>";
  const badge = (t, good = false) =>
    '<span class="tag' + (good ? " good" : "") + '">' + esc(t) + "</span>";
  function requestPage() {
    let html = head(
      "Approved requests",
      "Student Activities Office · 3 approved forms",
    );
    if (s.selected) {
      const r = getReq(s.selected);
      html +=
        btn("Back to list", "close") +
        '<div class="record"><small>' +
        r.id +
        " · Approved</small><h3>" +
        r.event +
        "</h3><p>" +
        r.club +
        " · Filed by " +
        r.owner +
        "</p><p><b>Return by</b> " +
        r.due +
        "</p><p><b>Approved equipment</b></p><ul>" +
        r.items.map((x) => "<li>" + x + "</li>").join("") +
        "</ul><p>" +
        r.note +
        "</p></div>";
    } else
      html += requests
        .map((r) =>
          row(
            r.event,
            r.id + " · " + r.club,
            btn("View form", "request", r.id),
          ),
        )
        .join("");
    return html;
  }
  function inventory() {
    let html = head(
      "Inventory",
      "Physical units · home shelf and current availability",
    );
    html +=
      '<div class="buttons"><label>Show <select data-filter>' +
      opts(
        ["All items", "On shelf", "On loan", "Needs check", "In repair"].map((f) => [f, f]),
      ) +
      "</select></label></div>";
    for (const a of assets) {
      const status = a.repair
        ? "In repair"
        : out(a.id)
          ? "On loan"
          : s.flags[a.id]
            ? "Needs check"
            : "On shelf";
      if (s.filter !== "All items" && s.filter !== status) continue;
      html += row(
        a.id + " · " + a.type,
        a.model + " · " + a.bin + (s.flags[a.id] ? " · Returned: " + s.flags[a.id] : ""),
        status === "Needs check"
          ? '<div class="buttons tight">' + tagged(status, "late") + btn("Checked, back in use", "clearflag", a.id) + "</div>"
          : badge(status, status === "On shelf"),
      );
    }
    return html;
  }
  function returnPanel(l) {
    const a = getAsset(l.asset);
    const r = getReq(l.req);
    const pick = (label, key, list, chosen) =>
      "<label><span>" +
      label +
      '</span><select name="' +
      key +
      '" required>' +
      (chosen ? "" : '<option value="">Ask them…</option>') +
      list
        .map(
          (v) =>
            '<option value="' +
            esc(v) +
            '"' +
            (v === chosen ? " selected" : "") +
            ">" +
            esc(v) +
            "</option>",
        )
        .join("") +
      "</select></label>";
    const [when, style] = timing(l);
    const d = s.draft && s.draft.num === l.num ? s.draft : null;
    const sug = d ? d.result : null;
    const suggestion = !d
      ? ""
      : '<div class="record suggest' + (sug.issues.length ? " unsure" : "") + '"><small>Suggested from the message · check before saving</small>' +
        "<p><b>Who has it:</b> " +
        (sug.holder
          ? esc(sug.holder) + ' <span class="quiet">from “' + esc(sug.evidence.holder) + "”</span>"
          : "<i>not sure</i>") +
        "<br><b>Promised back:</b> " +
        (sug.promised
          ? esc(sug.promised) + ' <span class="quiet">from “' + esc(sug.evidence.promised) + "”</span>"
          : "<i>not sure</i>") +
        "</p>" +
        (sug.issues.length
          ? "<p><b>Ask them:</b> " + sug.issues.map(esc).join(" · ") + "</p>"
          : "") +
        "</div>";
    return (
      head(
        "Return · slip L-" + l.num,
        r.id + " · " + r.club + " · " + r.event,
        btn("Back to register", "cancel"),
      ) +
      '<div class="record"><small>Unit on this slip</small><h3>' +
      tall(l.asset) + " (" + esc(a.type) + ")" +
      "</h3><p>Home bin " +
      esc(a.bin) +
      " · Signed out by " +
      esc(l.who) +
      " · Now with <b>" +
      esc(l.holder) +
      "</b> · " +
      tagged(when, style) +
      '</p><p class="check">Before closing: read the label on the unit in front of you. It must say <b>' +
      esc(a.id) +
      "</b> and <b>" +
      esc(a.model) +
      "</b>.</p>" +
      tellApart(l.asset) +
      "</div>" +
      '<form data-return="' +
      l.num +
      '"><h3 class="formhead">It is back at the counter</h3><div class="form">' +
      pick("Handed in by", "by", people, l.holder) +
      '<label class="tick"><input type="checkbox" name="label" required /> <span>The label reads ' +
      tall(l.asset) +
      "</span></label>" +
      pick("Condition", "cond", ["Working", "Damaged", "Part missing"], "Working") +
      '<label><span>What is wrong (if anything)</span><input name="condnote" maxlength="120" /></label>' +
      '</div><button type="submit" class="primary">Check in and close slip</button></form>' +
      '<form data-still="' +
      l.num +
      '"><h3 class="formhead">It is still out</h3><div class="form">' +
      '<label class="full"><span>What they told you</span><textarea name="why" rows="2" maxlength="240" placeholder="e.g. Leela still has the adapter, she\'ll drop it off tomorrow at nine">' +
      esc(d ? d.text : "") +
      "</textarea></label></div>" +
      btn("Suggest fields from message", "suggest", String(l.num)) +
      suggestion +
      '<div class="form">' +
      pick("Who has it now", "holder", people, d ? sug.holder || "" : l.holder) +
      pick(
        "Promised back by",
        "promised",
        timeList.filter((t) => times[t] > clockAt[s.phase]),
        d ? sug.promised || "" : "",
      ) +
      '</div><button type="submit">Keep slip open with new holder</button></form>'
    );
  }
  function checkinPanel() {
    return (
      head(
        "Check in an item",
        "Start from the unit in your hand, not from a name",
        btn("Back to register", "cancel"),
      ) +
      '<p class="check">Read the label on the unit. Pick the one that matches.</p>' +
      assets
        .filter((a) => !a.repair)
        .map(
          (a) =>
            '<div class="row"><div><strong>' + tall(a.id) + "</strong><small>" +
            esc(a.type + " · home bin " + a.bin) +
            (lookalikes(a.id).length ? " · look-alike in the same bin" : "") +
            "</small></div><div>" + btn("This one", "inhand", a.id) + "</div></div>",
        )
        .join("")
    );
  }
  function register() {
    if (s.returning) {
      const l = s.loans.find((x) => x.num === s.returning && !x.back);
      if (l) return returnPanel(l);
      s.returning = 0;
    }
    if (s.checkin) return checkinPanel();
    let html = head(
      "Loan register",
      "One slip per physical unit",
      s.editing
        ? btn("Cancel", "cancel")
        : '<div class="buttons tight">' +
            btn("Check in an item", "checkin", "", "primary") +
            btn("New issue slip", "new") +
            "</div>",
    );
    if (s.editing) {
      const available = assets.filter((a) => !a.repair && !out(a.id) && !s.flags[a.id]);
      const pairs = [];
      for (const a of available)
        for (const b of lookalikes(a.id))
          if (a.id < b.id && available.includes(b)) pairs.push(tall(a.id) + " and " + tall(b.id) + " share bin " + esc(a.bin));
      const select = (label, key, options) =>
        "<label><span>" +
        label +
        '</span><select name="' +
        key +
        '" required><option value="">Select…</option>' +
        opts(options) +
        "</select></label>";
      return (
        html +
        '<form data-issue><div class="form">' +
        select(
          "Approved request",
          "req",
          requests.map((r) => [r.id, r.id + " · " + r.club]),
        ) +
        select(
          "Unit leaving the desk",
          "asset",
          available.map((a) => [a.id, unitLabel(a.id)]),
        ) +
        select(
          "Collected by",
          "who",
          people.map((p) => [p, p]),
        ) +
        select(
          "Return by",
          "due",
          timeList.map((d) => [d, d]),
        ) +
        "</div>" +
        (pairs.length
          ? '<p class="lookalike"><b>Look-alikes on the shelf:</b> ' + pairs.join("; ") +
            ". Read the number and brand aloud as you hand one over.</p>"
          : "") +
        '<button type="submit" class="primary">Save issue slip</button></form>'
      );
    }
    html +=
      '<div class="buttons">' +
      ["Outstanding", "All slips"]
        .map(
          (v, i) =>
            '<button type="button" data-action="scope" data-val="' +
            i +
            '" aria-pressed="' +
            (s.onlyOpen === (i === 0)) +
            '">' +
            v +
            "</button>",
        )
        .join("") +
      "</div>";
    const shown = s.loans
      .filter((l) => !s.onlyOpen || !l.back)
      .slice()
      .reverse();
    if (s.phase === 2 && !s.acks[2] && s.loans.some((x) => !x.back))
      html +=
        '<div class="record handover"><small>Start of shift</small><p>Before you serve anyone, read back what the last shift left open.</p>' +
        btn("Open the handover in the Desk book", "tab", "Desk book", "primary") +
        "</div>";
    if (s.alert) {
      html += '<div class="record warn" role="alert"><small>Unit does not match an open slip</small><p>' + esc(s.alert) + "</p>";
      // Added after the evaluation (scenario S6): if the slip itself was wrong
      // at pickup, the desk needs a way to correct it, not just refuse.
      if (s.mismatch) {
        const m = s.mismatch;
        const first = s.loans.find((x) => x.num === m.slips[0]);
        const shelf = getAsset(first.asset);
        html +=
          '<form data-fix="' + esc(m.asset) + '"><h3 class="formhead">Or: the slip is wrong</h3>' +
          '<p>If the wrong unit was handed out at pickup, ' + esc(first.asset) + " should be sitting in bin " + esc(shelf.bin) + ".</p>" +
          '<div class="form"><label><span>Slip to correct</span><select name="num">' +
          m.slips
            .map((n) => {
              const l = s.loans.find((x) => x.num === n);
              return '<option value="' + n + '">L-' + n + " · " + esc(l.asset) + " · with " + esc(l.holder) + "</option>";
            })
            .join("") +
          '</select></label><label class="tick"><input type="checkbox" name="shelf" required /> <span>I checked bin ' +
          esc(shelf.bin) + " and " + esc(first.asset) + " is on the shelf</span></label></div>" +
          '<button type="submit">Correct the slip to ' + esc(m.asset) + " and check it in</button></form>";
      }
      html += "</div>";
    }
    if (!shown.length) html += "<p>No outstanding slips.</p>";
    for (const l of shown) {
      const r = getReq(l.req);
      const custody =
        l.holder !== l.who
          ? "Signed out by " + l.who + " · Now with " + l.holder
          : "With " + l.who;
      const sub = l.back
        ? l.req + " · " + r.club + " · Handed in by " + l.returnedBy + " · " + shifts[l.returnedAt].time
        : l.req + " · " + r.club + " · " + custody;
      let right;
      if (l.back)
        right =
          '<div class="buttons tight">' +
          badge("Returned", true) +
          (l.returnedAt === s.phase && !out(l.asset)
            ? btn("Undo return", "undo", String(l.num))
            : "") +
          "</div>";
      else {
        const [when, style] = timing(l);
        right =
          '<div class="buttons tight">' +
          tagged(when, style) +
          btn("Record return", "return", String(l.num)) +
          "</div>";
      }
      html += row("L-" + l.num + " · " + unitLabel(l.asset), sub, right);
      if (!l.back && l.log.length > 1)
        html +=
          '<p class="trail">' +
          l.log.map((e) => esc(shifts[e.phase].time + ": " + e.text)).join("<br>") +
          "</p>";
      if (!l.back && !l.holderOk)
        html +=
          '<div class="confirm"><p><b>Not yet confirmed by ' + esc(l.holder) + ".</b> Only " +
          esc(firstName(l.who)) + " has said " + esc(firstName(l.holder)) + " has it.</p>" +
          '<details><summary>Message to send ' + esc(firstName(l.holder)) + "</summary><p>" +
          esc(holderMessage(l)) + "</p></details>" +
          '<div class="buttons tight left">' +
          btn("Copy message", "copymsg", String(l.num)) +
          btn(firstName(l.holder) + " confirmed", "holderok", String(l.num)) +
          "</div></div>";
    }
    return html;
  }
  function deskbook() {
    let html = head(
      "Desk book",
      "Messages from clubs and notes for the next shift",
    );
    const entries = [
      [
        "Friday · 3:20 pm",
        "Isha Rao · Film Society",
        "Kabir Sen is picking up our whole screening kit. Please issue it in his name. I’m setting up in the courtyard.",
        0,
      ],
      [
        "Friday · 3:30 pm",
        "Tara Shah · Debate Union",
        "Our microphone stays with me overnight. I’ll return it by 10 am Saturday.",
        0,
      ],
    ];
    if (s.phase >= 1)
      entries.push([
        "Friday · 7:30 pm",
        "Kabir Sen · Film Society",
        "I brought the projector and speaker. Leela Das has our adapter. She’ll be at the counter at 9 am tomorrow.",
        1,
      ]);
    for (const n of s.notes)
      entries.push([shifts[n.phase].time, "Counter handover", n.text, n.phase]);
    // Custody changes are posted here from the slip itself, so the next shift
    // sees them without anyone having to remember to write a note.
    for (const l of s.loans)
      l.log.forEach((e, i) => {
        if (i > 0)
          entries.push([
            shifts[e.phase].time,
            "Loan register · L-" + l.num + " · " + l.asset,
            e.text,
            e.phase,
          ]);
      });
    entries.sort((x, y) => (x[3] ?? -1) - (y[3] ?? -1));
    const open = s.loans.filter((l) => !l.back);
    // Read-back, from the "synthesis by receiver" step of I-PASS handovers:
    // the incoming shift confirms each open item instead of skimming a list.
    const readBack = s.phase === 2 && !s.acks[2];
    if (open.length)
      html +=
        (readBack ? '<form data-ack class="record handover">' : '<div class="record handover">') +
        "<small>Still out at " +
        esc(shifts[s.phase].time) +
        (s.acks[s.phase] ? " · read back by the incoming shift" : "") +
        "</small>" +
        (readBack ? "<p><b>Read back each item before your first customer.</b></p>" : "") +
        open
          .map((l) => {
            const [when, style] = timing(l);
            const line =
              "<b>L-" + l.num + " · " + tall(l.asset) + "</b><br>With " + esc(l.holder) +
              (l.holderOk ? "" : " (not confirmed by them)") + " · " + tagged(when, style);
            return readBack
              ? '<label class="ack"><input type="checkbox" name="ack" value="' + l.num + '" required /> <span>' + line + "</span></label>"
              : "<p>" + line + "</p>";
          })
          .join("") +
        (readBack
          ? '<button type="submit" class="primary">I have read these back: start my shift</button></form>'
          : "</div>");
    for (const [t, author, body] of entries.slice().reverse())
      html +=
        '<article class="record"><small>' +
        esc(t) +
        "</small><h3>" +
        esc(author) +
        "</h3><p>" +
        esc(body) +
        "</p></article>";
    return (
      html +
      '<form data-note><div class="form"><label class="full"><span>Note for the next shift</span><textarea name="note" rows="2" maxlength="400" required></textarea></label></div><button type="submit">Add handover note</button></form>'
    );
  }
  function metricsPage() {
    let html = head(
      "Shift metrics",
      "Prototype instrumentation · what I would log at a real counter",
    );
    const m = s.metrics;
    const per = shifts.map((sh, i) => {
      const ev = m.filter((e) => e.phase === i);
      const acts = ev.filter((e) => e.kind === "closed" || e.kind === "kept-open");
      const secs = acts.map((e) => e.secs).filter((x) => x != null).sort((a, b) => a - b);
      const med = secs.length ? secs[Math.floor((secs.length - 1) / 2)] : null;
      const start = ev.find((e) => e.kind === "shift-start");
      return [
        sh.time,
        ev.filter((e) => e.kind === "closed").length,
        ev.filter((e) => e.kind === "kept-open").length,
        med == null ? "–" : med + " s",
        acts.length ? acts.map((e) => e.views).join(", ") : "–",
        ev.filter((e) => e.kind === "wrong-unit").length,
        start ? start.overdue + " of " + start.open : "–",
      ];
    });
    html +=
      '<div class="tablewrap"><table class="metrics"><thead><tr>' +
      [
        "Shift",
        "Slips closed",
        "Kept open with new holder",
        "Median time to act",
        "Screens opened before each act",
        "Wrong units caught",
        "Overdue at shift start",
      ]
        .map((h) => "<th>" + esc(h) + "</th>")
        .join("") +
      "</tr></thead><tbody>" +
      per
        .map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>")
        .join("") +
      "</tbody></table></div>" +
      (() => {
        const kept = m.filter((e) => e.kind === "kept-open" && e.suggestion);
        if (!kept.length) return "";
        const asIs = kept.filter((e) => e.suggestion.holder && e.suggestion.promised).length;
        return (
          "<p><b>Message suggestions:</b> " + m.filter((e) => e.kind === "suggested").length +
          " made · " + asIs + " of " + kept.length +
          " saved without changes. When the worker changes a suggestion, that is the extractor being wrong, and it goes into the evaluation set.</p>"
        );
      })() +
      (() => {
        const rb = m.filter((e) => e.kind === "handover-read-back");
        const msg = m.filter((e) => e.kind === "holder-messaged").length;
        const ok = m.filter((e) => e.kind === "holder-confirmed").length;
        const bad = s.loans.filter((l) => l.condition && l.condition !== "Working").length;
        return (
          "<p><b>Handover read back:</b> " +
          (rb.length ? "yes, " + rb[0].items + " item(s)" + (rb[0].secs != null ? ", " + rb[0].secs + " s after the shift started" : "") : "not yet") +
          " · <b>New holders messaged:</b> " + msg + " (" + ok + " confirmed)" +
          " · <b>Units returned damaged or incomplete:</b> " + bad + "</p>"
        );
      })() +
      '<p class="check">The number I care most about is <b>screens opened before acting</b> on the morning shift. ' +
      "If the slip carries custody, it should be 0–1: the worker goes from the label to the slip. " +
      "My hypothesis, to test at a real counter: in the original app the morning worker reads the Desk book, then the register, then Inventory before acting.</p>" +
      '<div class="buttons">' +
      btn("Copy metrics as JSON", "copymetrics") +
      "</div>";
    return html;
  }
  const screens = {
    Requests: requestPage,
    Inventory: inventory,
    "Loan register": register,
    "Desk book": deskbook,
    "Shift metrics": metricsPage,
  };
  function paint() {
    const phase = shifts[s.phase];
    q("[data-clock]").textContent = phase.time;
    q("[data-shift-title]").textContent = phase.title;
    q("[data-shift]").textContent = phase.text;
    const advance = q('[data-action="advance"]');
    advance.hidden = !phase.next;
    advance.textContent = phase.next || "";
    q("[data-nav]").innerHTML = pages
      .map(
        ([n, icon]) =>
          '<button type="button" data-action="tab" data-val="' +
          n +
          '" aria-pressed="' +
          (s.tab === n) +
          '"><svg aria-hidden="true" class="store-icon"><use href="#icon-' +
          icon +
          '"></use></svg>' +
          n +
          "</button>",
      )
      .join("");
    q("[data-page]").innerHTML = screens[s.tab]();
    if (q("[data-filter]")) q("[data-filter]").value = s.filter;
    q("[data-status]").textContent = s.notice;
  }
  function commit(msg) {
    if (msg) s.notice = msg;
    paint();
    try {
      localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      q("[data-status]").textContent +=
        " Browser storage is unavailable. Progress lasts for this visit.";
    }
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const v = b.dataset.val;
    s.alert = "";
    s.mismatch = null;
    switch (b.dataset.action) {
      case "copymetrics":
        try {
          navigator.clipboard.writeText(JSON.stringify(s.metrics, null, 2));
          s.notice = "Metrics copied (" + s.metrics.length + " events).";
        } catch {
          s.notice = "Clipboard unavailable in this browser.";
        }
        break;
      case "restart":
        s = original();
        break;
      case "advance":
        if (s.phase < 2) s.phase++;
        s.notice = "Shift time updated.";
        track("shift-start", {
          overdue: s.loans.filter((l) => !l.back && timing(l)[1] === "late").length,
          open: s.loans.filter((l) => !l.back).length,
        });
        break;
      case "tab":
        if (s.tab !== v) track("view", { screen: v });
        s.tab = v;
        s.editing = false;
        s.returning = 0;
        s.checkin = false;
        break;
      case "clearflag":
        if (!s.flags[v]) return;
        delete s.flags[v];
        track("flag-cleared", { asset: v });
        s.notice = v + " checked and back in use.";
        break;
      case "copymsg": {
        const l = s.loans.find((x) => x.num === Number(v));
        if (!l) return;
        try {
          navigator.clipboard.writeText(holderMessage(l)).catch(() => {});
          s.notice = "Message copied. Send it on WhatsApp or SMS, then mark the reply.";
        } catch {
          s.notice = "Clipboard unavailable. Open the message above and copy it by hand.";
        }
        track("holder-messaged", { num: l.num });
        break;
      }
      case "holderok": {
        const l = s.loans.find((x) => x.num === Number(v) && !x.back);
        if (!l || l.holderOk) return;
        l.holderOk = true;
        l.log.push({ phase: s.phase, text: l.holder + " confirmed they have it." });
        track("holder-confirmed", { num: l.num });
        s.notice = l.holder + " confirmed. Slip L-" + l.num + " updated.";
        break;
      }
      case "undo": {
        // Append-only: the slip reopens and its history says why. Nothing is
        // deleted, so a mistaken close stays visible to the next shift.
        const l = s.loans.find((x) => x.num === Number(v));
        if (!l || !l.back || l.returnedAt !== s.phase || out(l.asset)) return;
        l.back = false;
        l.log.push({
          phase: s.phase,
          text: "Return undone: slip had been closed by mistake (was handed in by " + l.returnedBy + ").",
        });
        l.returnedBy = "";
        l.returnedAt = -1;
        if (l.condition && l.condition !== "Working") delete s.flags[l.asset];
        l.condition = "";
        track("undone", { num: l.num });
        s.onlyOpen = true;
        s.notice = "Slip L-" + l.num + " reopened. " + l.asset + " is back on the outstanding list.";
        break;
      }
      case "suggest": {
        const l = s.loans.find((x) => x.num === Number(v) && !x.back);
        const text = String(q("textarea[name=why]")?.value || "").trim();
        if (!l || !text) {
          s.notice = "Type what they told you first.";
          break;
        }
        const result = window.CampusExtract.extract(text, {
          speaker: l.holder,
          people,
          times: timeList.filter((t) => times[t] > clockAt[s.phase]),
        });
        s.draft = { num: l.num, text, result };
        track("suggested", {
          num: l.num,
          filled: [result.holder, result.promised].filter(Boolean).length,
          issues: result.issues.length,
        });
        s.notice = result.issues.length
          ? "Suggestion ready. Some fields need you to ask them."
          : "Suggestion ready. Check it before saving.";
        break;
      }
      case "checkin":
        s.checkin = true;
        s.openedAt = Date.now();
        break;
      case "inhand": {
        // Item-first check-in: find the open slip for the unit actually in hand.
        s.checkin = false;
        const l = out(v);
        const a = getAsset(v);
        if (l) {
          s.returning = l.num;
          track("unit-matched", { asset: a.id, num: l.num });
          s.notice = a.id + " is on slip L-" + l.num + ". Confirm the return below.";
        } else {
          const waiting = s.loans.filter(
            (x) => !x.back && getAsset(x.asset).type === a.type,
          );
          s.notice = "No open slip for " + a.id + ". Do not take it in yet.";
          track("wrong-unit", { asset: a.id });
          if (waiting.length) s.mismatch = { asset: a.id, slips: waiting.map((x) => x.num) };
          s.alert =
            a.id + " · " + a.model + " is not out on any slip; it belongs on shelf " + a.bin + "." +
            (waiting.length
              ? " The open " + a.type + " slip is for " +
                waiting.map((x) => x.asset + " · " + getAsset(x.asset).model + " (with " + x.holder + ")").join(", ") +
                ". Check whether this is someone's own unit before taking it."
              : "");
        }
        break;
      }
      case "close":
        s.selected = "";
        break;
      case "request":
        track("view", { screen: "Request " + v });
        s.selected = v;
        break;
      case "new":
        s.editing = true;
        break;
      case "cancel":
        s.editing = false;
        s.draft = null;
        s.returning = 0;
        s.checkin = false;
        break;
      case "scope":
        s.onlyOpen = v === "0";
        break;
      case "return": {
        const l = s.loans.find((l) => l.num === Number(v));
        if (!l || l.back) return;
        // Opens the return screen; nothing closes on a single click any more.
        s.returning = l.num;
        s.openedAt = Date.now();
        break;
      }
    }
    commit();
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-filter]")) {
      s.filter = e.target.value;
      commit();
    }
  });
  root.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    s.alert = "";
    s.mismatch = null;
    const form = new FormData(f);
    if (f.matches("[data-note]")) {
      const text = String(form.get("note")).trim();
      if (!text) return;
      s.notes.push({ phase: s.phase, text });
      commit("Handover note saved.");
      return;
    }
    if (f.matches("[data-ack]")) {
      const nums = form.getAll("ack").map(Number);
      const open = s.loans.filter((l) => !l.back).map((l) => l.num);
      if (!open.every((n) => nums.includes(n))) return;
      const start = s.metrics.filter((e) => e.kind === "shift-start").pop();
      s.acks[s.phase] = { at: Date.now(), items: open };
      track("handover-read-back", {
        items: open.length,
        secs: start ? Math.round((Date.now() - start.at) / 1000) : null,
      });
      commit("Handover read back: " + open.length + " item(s) still out. Shift started.");
      return;
    }
    if (f.matches("[data-fix]")) {
      const unit = getAsset(f.dataset.fix);
      const l = s.loans.find((x) => x.num === Number(form.get("num")) && !x.back);
      if (!unit || !l || out(unit.id) || !form.get("shelf")) return;
      const was = l.asset;
      l.asset = unit.id;
      l.log.push({
        phase: s.phase,
        text: "Unit corrected from " + was + " to " + unit.id + ": " + was + " was found on the shelf. Wrong unit handed out at pickup.",
      });
      track("slip-corrected", { num: l.num, from: was, to: unit.id });
      s.returning = l.num;
      s.openedAt = Date.now();
      commit("Slip L-" + l.num + " corrected to " + unit.id + ". Confirm the return below.");
      return;
    }
    if (f.matches("[data-return]") || f.matches("[data-still]")) {
      const back = f.matches("[data-return]");
      const l = s.loans.find(
        (x) => x.num === Number(back ? f.dataset.return : f.dataset.still),
      );
      if (!l || l.back) return;
      const time = shifts[s.phase].time;
      if (back) {
        const by = String(form.get("by"));
        const cond = String(form.get("cond") || "Working");
        const note = String(form.get("condnote") || "").trim();
        if (!people.includes(by) || !form.get("label")) return;
        if (!["Working", "Damaged", "Part missing"].includes(cond)) return;
        l.back = true;
        l.returnedBy = by;
        l.returnedAt = s.phase;
        l.condition = cond;
        if (cond !== "Working") s.flags[l.asset] = cond + (note ? ": " + note : "");
        l.log.push({
          phase: s.phase,
          text: "Checked in from " + by + ". Label confirmed. " +
            (cond === "Working" ? "Working." : cond + (note ? " (" + note + ")" : "") + ". Kept off the shelf until checked.") +
            " Slip closed.",
        });
        track("closed", {
          num: l.num,
          secs: s.openedAt ? Math.round((Date.now() - s.openedAt) / 1000) : null,
          views: viewsSinceLast(),
        });
        s.openedAt = 0;
        const left = s.loans.filter((x) => x.req === l.req && !x.back);
        s.returning = 0;
        commit(
          l.asset + " checked in from " + by + ". Slip L-" + l.num + " closed. " +
            (left.length
              ? left.length + " more item(s) on " + l.req + " still out."
              : getReq(l.req).club + " kit " + l.req + " is complete."),
        );
        return;
      }
      const holder = String(form.get("holder"));
      const promised = String(form.get("promised"));
      const why = String(form.get("why") || "").trim();
      if (!people.includes(holder) || !times[promised]) return;
      const moved = holder !== l.holder;
      l.holder = holder;
      l.promised = promised;
      // Only the person at the counter has spoken; the new holder has not.
      if (moved && holder !== l.who) l.holderOk = false;
      l.log.push({
        phase: s.phase,
        text:
          (moved ? "Now with " + holder + ". " : "Still with " + holder + ". ") +
          "Promised back " + promised + "." + (why ? " “" + why + "”" : ""),
      });
      const d = s.draft && s.draft.num === l.num ? s.draft.result : null;
      s.draft = null;
      track("kept-open", {
        num: l.num,
        suggestion: d
          ? { holder: d.holder === holder, promised: d.promised === promised }
          : null,
        secs: s.openedAt ? Math.round((Date.now() - s.openedAt) / 1000) : null,
        views: viewsSinceLast(),
      });
      s.openedAt = 0;
      s.returning = 0;
      commit("Slip L-" + l.num + " kept open: " + l.asset + " with " + holder + ", promised " + promised + ".");
      return;
    }
    if (!f.matches("[data-issue]")) return;
    const [req, asset, who, due] = ["req", "asset", "who", "due"].map((k) =>
      form.get(k),
    );
    const unit = getAsset(asset),
      r = getReq(req);
    if (!r || !unit || unit.repair || out(asset) || !people.includes(who))
      return;
    if (!r.items.includes(unit.type)) {
      q("[data-status]").textContent =
        "This equipment type is outside the approved request. Choose an approved unit.";
      return;
    }
    if (
      s.loans.some(
        (l) => l.req === req && !l.back && getAsset(l.asset).type === unit.type,
      )
    ) {
      q("[data-status]").textContent =
        "The approved quantity of this equipment type is already on loan.";
      return;
    }
    const num = Math.max(...s.loans.map((l) => l.num)) + 1;
    s.loans.push(
      slip({
        num,
        req,
        asset,
        who,
        due,
        back: false,
        log: [{ phase: s.phase, text: "Signed out to " + who + ". Due " + due + "." }],
      }),
    );
    s.editing = false;
    commit("Issued " + asset + " to " + who + " on slip L-" + num + ".");
  });
  function restore(d) {
    if (
      !d ||
      d.version !== 2 ||
      !Object.hasOwn(screens, d.tab) ||
      !shifts[d.phase] ||
      (d.selected && !getReq(d.selected)) ||
      !Array.isArray(d.notes) ||
      !Array.isArray(d.metrics) ||
      !d.flags || typeof d.flags !== "object" ||
      !d.acks || typeof d.acks !== "object" ||
      !d.notes.every(
        (n) => n && shifts[n.phase] && typeof n.text === "string",
      ) ||
      !Array.isArray(d.loans) ||
      !d.loans.length ||
      !d.loans.every(
        (l) =>
          l &&
          getReq(l.req) &&
          getAsset(l.asset) &&
          Number.isInteger(l.num) &&
          Array.isArray(l.log) &&
          l.log.every((e) => e && shifts[e.phase]) &&
          (!l.back || shifts[l.returnedAt]),
      )
    )
      return;
    s = {
      ...original(),
      ...d,
      loans: d.loans.map((l) => slip({ ...l, log: l.log.map((e) => ({ ...e })) })),
      notes: d.notes.map((n) => ({ ...n })),
    };
    paint();
  }
  paint();
  try {
    restore(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    // Keep the fresh shift when storage is unavailable or the saved data is invalid.
  }
})();
