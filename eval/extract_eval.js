// Evaluation set for extract.js: what people say at the counter when only part
// of a kit comes back, and what the "still out" fields should be.
//
// Each field is graded:
//   correct  : filled in with the right value
//   abstain  : left empty with a reason, so the worker has to ask (safe)
//   unsafe   : filled in with the WRONG value (the error that matters)
//   missed   : left empty although the message was clear (costs time, safe)
// Target: zero unsafe. Run with:  node eval/extract_eval.js
const { extract } = require("../extract.js");

const ctx = {
  speaker: "Kabir Sen",
  people: ["Isha Rao", "Kabir Sen", "Leela Das", "Tara Shah", "Dev Menon"],
  times: ["Fri 8 pm", "Sat 9 am", "Sat 10 am", "Sat noon"],
};

// expected null means "the message does not settle this; the worker must ask".
const cases = [
  ["Leela still has the adapter. She'll drop it off tomorrow at nine.", "Leela Das", "Sat 9 am"],
  ["I brought the projector and speaker. Leela Das has our adapter. She'll be at the counter at 9 am tomorrow.", "Leela Das", "Sat 9 am"],
  ["Leela took it home, back by 10 tomorrow", "Leela Das", "Sat 10 am"],
  ["Isha has it, she'll bring it Saturday noon", "Isha Rao", "Sat noon"],
  ["Leela has it, she'll drop it tonight by 8", "Leela Das", "Fri 8 pm"],
  ["Rohan borrowed it after the screening, back tomorrow 9", null, "Sat 9 am"],
  ["Leela or Isha has it, not sure. Tomorrow morning.", null, null],
  ["She'll bring it tomorrow at nine", null, "Sat 9 am"],
  ["Leela has it, back tomorrow at 4 pm", "Leela Das", null],
  ["I'll bring it myself tomorrow at 9", "Kabir Sen", "Sat 9 am"],
  ["Leela has it. Not tomorrow, Sunday maybe.", "Leela Das", null],
  ["Tara has the adapter? No wait, Leela has it. Tomorrow 9.", "Leela Das", "Sat 9 am"],
  ["Leela's got it, 9am tmrw", "Leela Das", "Sat 9 am"],
  ["leela das has it, will return 10 am sat", "Leela Das", "Sat 10 am"],
  ["Dev has it till Saturday 12", "Dev Menon", "Sat noon"],
  ["Leela has it, she'll drop it at 9", "Leela Das", null],
  ["Leela has AD-12, back tomorrow at ten", "Leela Das", "Sat 10 am"],
  ["Leela kept it. She said around 10 or 11 tomorrow", "Leela Das", null],
];

const grade = (got, want) => {
  if (got === want) return want === null ? "abstain" : "correct";
  if (got === null) return "missed";
  return "unsafe";
};

const tally = { correct: 0, abstain: 0, missed: 0, unsafe: 0 };
const rows = [];
for (const [msg, holder, promised] of cases) {
  const r = extract(msg, ctx);
  const g = [grade(r.holder, holder), grade(r.promised, promised)];
  g.forEach((x) => tally[x]++);
  rows.push({ msg, want: [holder, promised], got: [r.holder, r.promised], g, issues: r.issues });
}

const mark = { correct: "✅", abstain: "🟡 asks", missed: "⚪ missed", unsafe: "❌ UNSAFE" };
console.log("| Message | Holder | Promised | Why it asks |");
console.log("|---|---|---|---|");
for (const r of rows)
  console.log(
    `| ${r.msg} | ${mark[r.g[0]]} ${r.got[0] ?? ""} | ${mark[r.g[1]]} ${r.got[1] ?? ""} | ${r.issues.join("; ")} |`,
  );
const n = cases.length * 2;
console.log(
  `\n**${n} fields:** ${tally.correct} correct · ${tally.abstain} correctly asked · ${tally.missed} missed (asked when it didn't need to) · **${tally.unsafe} unsafe**`,
);
process.exitCode = tally.unsafe ? 1 : 0;
