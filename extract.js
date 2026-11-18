// Turns what someone says at the counter ("Leela still has the adapter, she'll
// drop it off tomorrow at nine") into the two fields of a "still out" slip:
// who has it now and when it is promised back.
//
// This is a rule-based stand-in for a language model, so the prototype runs
// offline. The contract is what matters, and it is the structured output I
// would ask a model for:
//   { holder, promised, evidence: {holder, promised}, issues: [] }
// A field is null whenever the message does not settle it. The desk worker
// always sees the suggestion and the words it came from before anything is
// saved. eval/extract_eval.js measures how often it is right, how often it
// abstains, and, most importantly, how often it is confidently wrong.
(function (root) {
  const words = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const days = [
    [/\b(fri|friday|tonight|today|this evening)\b/, "Fri"],
    [/\b(sat|saturday|tomorrow|tmrw|tmr|tomo)\b/, "Sat"],
    [/\b(sun|sunday|mon|monday|next week)\b/, "Later"],
  ];

  function findHolder(text, ctx) {
    const lower = text.toLowerCase();
    const found = new Map();
    for (const p of ctx.people) {
      const first = p.split(" ")[0].toLowerCase();
      const re = new RegExp("\\b(" + p.toLowerCase() + "|" + first + ")\\b");
      const m = lower.match(re);
      if (m) found.set(p, m.index);
    }
    // The speaker saying "I have it" or "with me".
    const self = lower.match(/\b(i have|i've got|i still have|i'll bring|i will bring|with me)\b/);
    if (self && ctx.speaker) found.set(ctx.speaker, self.index);
    // A capitalised name that is not on the desk's list of people.
    const unknown = [];
    const nameRe = /\b([A-Z][a-z]+)\b(?=\s+(?:has|have|took|borrowed|kept|is keeping|'s got|still has|will|'ll))/g;
    for (const m of text.matchAll(nameRe)) {
      const n = m[1];
      if (["She", "He", "They", "It", "We", "I"].includes(n)) continue;
      if (!ctx.people.some((p) => p.split(" ").includes(n))) unknown.push(n);
    }
    if (unknown.length)
      return { value: null, issue: "Mentions " + unknown.join(", ") + ", who is not on the desk's list" };
    if (found.size === 1) {
      const [p, at] = [...found][0];
      return { value: p, evidence: text.slice(Math.max(0, at - 10), at + 30).trim() };
    }
    if (found.size > 1)
      return { value: null, issue: "Mentions more than one person (" + [...found.keys()].join(", ") + ")" };
    return { value: null, issue: "No name in the message" };
  }

  function findPromised(text, ctx) {
    const lower = text.toLowerCase();
    let day = null;
    let dayEvidence = "";
    for (const [re, d] of days) {
      const m = lower.match(re);
      if (m) {
        if (day && day !== d) return { value: null, issue: "Mentions more than one day" };
        day = d;
        dayEvidence = m[0];
      }
    }
    if (day === "Later")
      return { value: null, issue: "Promised after the desk's last slot (" + dayEvidence + ")" };

    let hour = null;
    let ampm = "";
    let timeEvidence = "";
    const noon = lower.match(/\b(noon|midday)\b/);
    // Digits inside unit or slip labels (AD-12, L-404) are not times.
    const timeRe =
      /(?<![\w-])(?:at|by|till|until|around|for)?\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::00)?\s*(am|pm|a\.m\.|p\.m\.)?(?![\w-])/g;
    const all = [...lower.matchAll(timeRe)];
    if (new Set(all.map((m) => m[1])).size > 1)
      return { value: null, issue: "Mentions more than one time (" + all.map((m) => m[0].trim()).join(", ") + ")" };
    const t = all[0];
    if (noon) {
      hour = 12;
      ampm = "pm";
      timeEvidence = noon[0];
    } else if (t) {
      hour = /\d/.test(t[1]) ? Number(t[1]) : words[t[1]];
      ampm = (t[2] || "").replace(/\./g, "");
      timeEvidence = t[0].trim();
    }
    if (/\b(morning|evening|afternoon|later|sometime|soon)\b/.test(lower) && hour == null)
      return { value: null, issue: "No exact time given" };
    if (hour == null) return { value: null, issue: "No time in the message" };
    if (!day)
      return { value: null, issue: "Time given without a day (" + timeEvidence + ")" };

    // Read the hour on a 24-hour clock. Without am/pm, take the reading that
    // makes sense for a desk: Friday times are evening, Saturday times morning.
    let h24;
    if (ampm === "am") h24 = hour % 12;
    else if (ampm === "pm") h24 = (hour % 12) + 12;
    else if (hour === 12) h24 = 12;
    else h24 = day === "Fri" ? hour + 12 : hour;
    const key = day + " " + (h24 === 12 ? "noon" : (h24 % 12 || 12) + (h24 < 12 ? " am" : " pm"));
    if (!ctx.times.includes(key))
      return { value: null, issue: "No desk slot for " + key };
    return { value: key, evidence: (dayEvidence + " … " + timeEvidence).trim() };
  }

  function extract(text, ctx) {
    const issues = [];
    if (/\b(maybe|not sure|might|i think|probably)\b/i.test(text))
      issues.push("The message sounds unsure: confirm with them");
    const holder = findHolder(text, ctx);
    const promised = findPromised(text, ctx);
    if (holder.issue) issues.push(holder.issue);
    if (promised.issue) issues.push(promised.issue);
    return {
      holder: holder.value,
      promised: promised.value,
      evidence: { holder: holder.evidence || "", promised: promised.evidence || "" },
      issues,
    };
  }

  root.CampusExtract = { extract };
  if (typeof module !== "undefined") module.exports = { extract };
})(typeof window !== "undefined" ? window : globalThis);
