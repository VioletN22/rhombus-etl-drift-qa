// Rhombus Drift QA dashboard. Reads data.json (built by scripts/build_dashboard.py).
// No framework, no build step.

const GITHUB_BASE = "https://github.com/VioletN22/rhombus-etl-drift-qa";
const GITHUB_BRANCH = "main";
const TZ = "Australia/Sydney";

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const blob = (path) => `${GITHUB_BASE}/blob/${GITHUB_BRANCH}/${path}`;
const chip = (cls, text, extra = "") => `<span class="chip ${cls} ${extra}">${esc(text)}</span>`;
const pendingChip = (text = "Awaiting run") => chip("s-none", text);

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString("en-AU", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

const CAPABILITY = {
  handled: ["s-ok", "Handled", "Run succeeded and the validator passed the output."],
  warned: ["s-warn", "Warned", "Rhombus flagged the change in the UI, logs or email."],
  broke: ["s-bad", "Broke", "Run failed or stopped. Loud, and nothing wrong reached GCS."],
  missed: ["s-bad", "Missed", "Run succeeded but the output was wrong. Silent bad data.", "missed"],
  unverified: ["s-none", "Not validated", "Run observed, no validator report yet."],
  pending: ["s-none", "Awaiting run", "Not run against Rhombus yet."],
};
const capChip = (c) => {
  const [cls, label, , extra] = CAPABILITY[c] || CAPABILITY.pending;
  return chip(cls, label, `cap ${extra || ""}`);
};

const VERDICT = {
  pass: ["s-ok", "Pass"],
  pass_with_warnings: ["s-ok", "Pass, with warnings"],
  fail: ["s-bad", "Fail"],
  "no-output": ["s-bad", "No output"],
};
const verdictChip = (v, summary) => {
  if (!v) return pendingChip("No report");
  const [cls, label] = VERDICT[v] || ["s-none", v];
  let text = label;
  if (summary && v === "fail") text = `Fail, ${summary.fail} check${summary.fail === 1 ? "" : "s"}`;
  if (summary && v === "pass_with_warnings") text = `Pass, ${summary.warn} warn`;
  return chip(cls, text);
};

const SCALE = {
  logs_clear: { clear: ["s-ok", "Clear"], partial: ["s-warn", "Partial"], misleading: ["s-bad", "Misleading"] },
  chatbot_diagnosis: { correct: ["s-ok", "Correct"], partial: ["s-warn", "Partial"], wrong: ["s-bad", "Wrong"], na: ["s-none", "Not asked"] },
  chatbot_fix_worked: { yes: ["s-ok", "Fix worked"], no: ["s-bad", "Fix failed"], na: ["s-none", "No fix"] },
  severity: { Critical: ["s-bad", "Critical"], High: ["s-bad", "High"], Medium: ["s-warn", "Medium"], Low: ["s-ok", "Low"], na: ["s-none", "n/a"] },
};
const na = () => `<span class="quiet">n/a</span>`;
const quiet = () => `<span class="quiet" aria-label="awaiting run">\u2013</span>`;
function scaleChip(field, value, done) {
  if (!done) return quiet();
  if (value === null || value === undefined || value === "") return pendingChip(done ? "Not recorded" : "Awaiting run");
  const hit = SCALE[field][value];
  return hit ? chip(hit[0], hit[1]) : chip("s-none", value);
}

const GROUP_LABEL = {
  baseline: "Baseline", schema: "Schema drift, one change at a time",
  combined: "Schema drift, all four together", semantic: "Semantic drift",
  edge: "Edge cases (file format, not content)",
};

// ---- sections ---------------------------------------------------------------

function renderMeta(d) {
  const done = d.cases.filter((c) => c.status === "done").length;
  const built = new Date(d.built_at).toLocaleString("en-AU", {
    timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit",
    minute: "2-digit", hour12: false, timeZoneName: "short",
  });
  $("#meta").textContent = `${done} of ${d.cases.length} cases observed, ` +
    `${d.sources.report_count} validator report${d.sources.report_count === 1 ? "" : "s"}. ` +
    `Built ${built}.`;
  $("#banner").hidden = !d.demo;
  $("#repo-link").href = GITHUB_BASE;
  $("#foot-sources").innerHTML = `Data: <code>${esc(d.sources.reports)}</code>` +
    (d.sources.ledger ? `, <code>${esc(d.sources.ledger)}</code>` : "") +
    `, <code>${esc(d.sources.matrix)}</code>.`;
}

function renderCapability(d) {
  $("#legend").innerHTML = ["handled", "warned", "broke", "missed", "pending"]
    .map((k) => `<div>${capChip(k)}<span>${esc(CAPABILITY[k][2])}</span></div>`).join("");

  const head = `<div class="hm-row head" aria-hidden="true">
    <div>Input file and change</div><div>Rhombus</div><div>Validator</div>
    <div>Logs</div><div>Chatbot</div><div>Its fix</div><div>Severity</div></div>`;
  let html = head;
  let group = null;
  for (const c of d.cases) {
    if (c.group !== group) {
      group = c.group;
      html += `<div class="hm-group">${esc(GROUP_LABEL[group] || group)}</div>`;
    }
    const m = c.matrix;
    const done = c.status === "done";
    const behaviour = done ? [m.rhombus_status, (m.platform_behaviour || "").replace("_", " ")]
      .filter(Boolean).join(", ") : "";
    const cell = (k, body, sub = "") => `<div class="hm-cell"><span class="k">${k}</span>${body}` +
      (sub ? `<span class="chart-note">${esc(sub)}</span>` : "") + `</div>`;
    html += `<div class="hm-row ${done ? "" : "pending"}">
      <div class="hm-case"><span class="name">${esc(c.case)}</span><span class="change">${esc(c.change)}</span></div>
      ${cell("Rhombus", capChip(c.capability), behaviour)}
      ${cell("Validator", c.validator ? verdictChip(c.validator.verdict, c.validator.summary) : (done ? pendingChip("No report") : quiet()))}
      ${cell("Logs", scaleChip("logs_clear", m.logs_clear, done))}
      ${cell("Chatbot", c.case === "baseline" ? na() : scaleChip("chatbot_diagnosis", m.chatbot_diagnosis, done))}
      ${cell("Its fix", c.case === "baseline" ? na() : scaleChip("chatbot_fix_worked", m.chatbot_fix_worked, done))}
      ${cell("Severity", c.case === "baseline" ? na() : scaleChip("severity", m.severity, done))}
    </div>`;
  }
  $("#heatmap").innerHTML = html;
}

function renderHealth(d) {
  $("#health-chart").innerHTML = d.health.map((h) => {
    const label = `<div class="bar-label ${h.runs ? "" : "pending"}">${esc(h.label)}
      <span class="sub">${h.cases_run} of ${h.cases} case${h.cases === 1 ? "" : "s"} run</span></div>`;
    if (!h.runs) {
      return `<div class="bar-row">${label}<div class="track" aria-hidden="true"></div>
        <div class="bar-value pending">Awaiting run</div></div>`;
    }
    const ok = (h.succeeded / h.runs) * 100;
    const bad = (h.failed / h.runs) * 100;
    return `<div class="bar-row">${label}
      <div class="track" role="img" aria-label="${h.succeeded} succeeded, ${h.failed} failed of ${h.runs} runs">
        <div class="seg ok" style="width:${ok}%"></div><div class="seg bad" style="width:${bad}%"></div></div>
      <div class="bar-value">${h.succeeded} of ${h.runs} succeeded
        <span class="sub">${Math.round(h.success_rate * 100)}%${h.failed ? `, ${h.failed} failed` : ""}</span></div></div>`;
  }).join("") + `<p class="chart-note">Green: run wrote output. Red: no output by the next scheduled slot. Hatched: not run yet.</p>`;
}

function renderTiming(d) {
  const timed = d.cases.filter((c) => typeof c.matrix.execution_seconds === "number");
  if (!timed.length) {
    $("#timing-chart").innerHTML = `<div class="empty">No run times recorded yet (0 of ${d.cases.length} cases).
      Each case's duration and credits go in <code>observations/matrix.yaml</code> after the run.</div>`;
    return;
  }
  const base = d.cases.find((c) => c.case === "baseline")?.matrix.execution_seconds;
  const max = Math.max(...timed.map((c) => c.matrix.execution_seconds), base || 0) * 1.08;
  const fmt = (s) => (s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
  $("#timing-chart").innerHTML = d.cases.map((c) => {
    const s = c.matrix.execution_seconds;
    const credits = c.matrix.credits_used;
    const label = `<div class="bar-label ${typeof s === "number" ? "" : "pending"}"><span class="mono">${esc(c.case)}</span></div>`;
    if (typeof s !== "number") {
      return `<div class="bar-row">${label}<div class="track" aria-hidden="true"></div><div class="bar-value pending">Awaiting run</div></div>`;
    }
    const ref = typeof base === "number" && c.case !== "baseline"
      ? `<div class="ref" style="left:${(base / max) * 100}%" title="baseline ${fmt(base)}"></div>` : "";
    let delta = c.case === "baseline" ? "baseline" : "";
    if (!delta && typeof base === "number") {
      const diff = s - base;
      delta = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))} vs baseline`;
    }
    const sub = [delta, typeof credits === "number" ? `${credits} credit${credits === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
    return `<div class="bar-row">${label}
      <div class="track" role="img" aria-label="${esc(c.case)} ran for ${fmt(s)}"><div class="seg time" style="width:${(s / max) * 100}%"></div>${ref}</div>
      <div class="bar-value">${fmt(s)}<span class="sub">${esc(sub)}</span></div></div>`;
  }).join("") + `<p class="chart-note">The dark tick on each bar marks the baseline run time.</p>`;
}

const HASH_COLOURS = ["var(--accent)", "var(--warn)", "var(--bad)", "var(--none)"];
function hashView(h, colour) {
  return `<span class="hash"><span class="hash-swatch" style="background:${colour}"></span>${esc(h.slice(0, 12))}<span class="tail">${esc(h.slice(12, 20))}</span></span>`;
}

function renderConsistency(d) {
  if (!d.consistency.length) {
    $("#consistency-body").innerHTML = `<div class="empty">No consistency trials defined in <code>observations/matrix.yaml</code>.</div>`;
    return;
  }
  $("#consistency-body").innerHTML = d.consistency.map((t) => {
    const runs = t.runs;
    const hashes = [...new Set(runs.map((r) => r.output_sha256))];
    const colourOf = (h) => HASH_COLOURS[Math.min(hashes.indexOf(h), HASH_COLOURS.length - 1)];
    let status;
    if (runs.length < 2) status = pendingChip(`${runs.length} of ${t.target_runs} runs`);
    else if (t.comparison.all_match) status = chip("s-ok", `Identical across ${runs.length} runs`);
    else status = chip("s-bad", `${t.comparison.distinct_hashes} different outputs from ${runs.length} runs`);

    const slots = [];
    for (let i = 0; i < Math.max(t.target_runs, runs.length); i++) {
      const r = runs[i];
      if (!r) {
        slots.push(`<div class="slot waiting"><div class="n">Run ${i + 1}</div>Awaiting run</div>`);
        continue;
      }
      slots.push(`<div class="slot"><div class="n">Run ${i + 1}, ${when(r.timestamp)}</div>
        <div class="run">${esc(r.run)}</div>
        <dl><dt>Hash</dt><dd>${hashView(r.output_sha256, colourOf(r.output_sha256))}</dd>
        <dt>Rows</dt><dd>${r.output_rows}</dd>
        <dt>Oracle</dt><dd>${r.matches_oracle ? "matches" : "differs"}</dd>
        <dt>Verdict</dt><dd>${verdictChip(r.verdict, r.summary)}</dd></dl></div>`);
    }

    let diff = "";
    if (runs.length > 1 && !t.comparison.all_match) {
      const cols = runs.map((r, i) => `<th>Run ${i + 1}</th>`).join("");
      const row = (label, vals) => {
        const differs = new Set(vals.map(String)).size > 1;
        return `<tr><td>${label}</td>${vals.map((v) => `<td class="${differs ? "diff" : ""}">${v}</td>`).join("")}</tr>`;
      };
      const statusOf = (r, id) => r.checks.find((c) => c.id === id)?.status ?? "";
      let rows = row("Canonical hash", runs.map((r) => `<span class="hash">${esc(r.output_sha256.slice(0, 12))}</span>`));
      rows += row("Output rows", runs.map((r) => r.output_rows));
      for (const id of t.comparison.differing_checks) rows += row(`<span class="mono">${esc(id)}</span>`, runs.map((r) => esc(statusOf(r, id))));
      for (const col of t.comparison.mismatch_columns) {
        const vals = runs.map((r) => r.oracle_mismatches[col] ?? "");
        if (new Set(vals).size > 1) rows += row(`Cells differing from oracle in <span class="mono">${esc(col)}</span>`, vals);
      }
      diff = `<h3 style="margin-top:20px">Where the runs differ</h3>
        <div class="scroll-x"><table><thead><tr><th></th>${cols}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    const missing = t.missing_reports?.length
      ? `<p class="chart-note">No report found for: ${t.missing_reports.map(esc).join(", ")}</p>` : "";
    return `<div class="trial"><div class="trial-head"><h3>${esc(t.case)}</h3>${status}
      <span class="sub">${esc(t.pipeline)}</span></div>
      <div class="slots">${slots.join("")}</div>${diff}${missing}
      ${t.notes ? `<p class="chart-note">${esc(t.notes)}</p>` : ""}</div>`;
  }).join("");
}

function renderBuilder(d) {
  const b = d.ai_builder;
  let status;
  if (b.compared < 2) status = pendingChip(`${b.compared} of ${b.attempts.length} attempts recorded`);
  else if (b.identical) status = chip("s-ok", `Same ${b.positions.length} nodes in all ${b.compared} attempts`);
  else status = chip("s-warn", `Node lists differ at ${b.positions.filter((p) => !p.same).length} of ${b.positions.length} positions`);

  const cards = b.attempts.map((a) => {
    if (a.status !== "done" || !a.nodes?.length) {
      return `<div class="slot waiting attempt"><div class="n">Attempt ${a.attempt}</div>Awaiting run</div>`;
    }
    const items = a.nodes.map((n, i) => {
      const same = b.positions[i]?.same !== false;
      return `<li class="${same ? "" : "differs"}">${esc(n)}${same ? "" : " (differs)"}</li>`;
    }).join("");
    const meta = [a.date, typeof a.credits_used === "number" ? `${a.credits_used} credits` : "",
      a.follow_up_prompts ? `${a.follow_up_prompts} follow-up prompt${a.follow_up_prompts === 1 ? "" : "s"}` : "no follow-ups"]
      .filter(Boolean).join(", ");
    return `<div class="slot attempt"><div class="n">Attempt ${a.attempt}, ${esc(meta)}</div>
      <ol>${items}</ol>${a.notes ? `<p class="notes">${esc(a.notes)}</p>` : ""}</div>`;
  }).join("");
  $("#builder-body").innerHTML = `<div class="trial-head">${status}
    <span class="sub">Prompt: <a href="${blob("prompts/pipeline-prompt.md")}">prompts/pipeline-prompt.md</a></span></div>
    <div class="attempts">${cards}</div>`;
}

function renderChatbot(d) {
  const drift = d.cases.filter((c) => c.case !== "baseline");
  const done = drift.filter((c) => c.status === "done");
  const count = (field, val) => done.filter((c) => c.matrix[field] === val).length;
  const tally = done.length
    ? [chip("s-ok", `${count("chatbot_diagnosis", "correct")} correct`),
       chip("s-warn", `${count("chatbot_diagnosis", "partial")} partial`),
       chip("s-bad", `${count("chatbot_diagnosis", "wrong")} wrong`),
       chip("s-ok", `${count("chatbot_fix_worked", "yes")} fixes worked`),
       chip("s-bad", `${count("chatbot_fix_worked", "no")} fixes failed`)].join("")
    : pendingChip(`0 of ${drift.length} cases asked`);
  const rows = drift.map((c) => {
    const ok = c.status === "done";
    return `<tr><td>${esc(c.case)}</td>
      <td>${ok ? scaleChip("chatbot_diagnosis", c.matrix.chatbot_diagnosis, ok) : pendingChip()}</td>
      <td>${scaleChip("chatbot_fix_worked", c.matrix.chatbot_fix_worked, ok)}</td>
      <td>${ok && c.matrix.schedule_after ? esc(c.matrix.schedule_after) : quiet()}</td>
      <td>${ok ? `<a href="${blob(c.observation)}">${esc(c.observation.split("/").pop())}</a>` : `<span class="local">Not written yet</span>`}</td></tr>`;
  }).join("");
  $("#chatbot-body").innerHTML = `<div class="tally">${tally}</div>
    <div class="scroll-x"><table class="scorecard"><thead><tr><th>Case</th><th>Diagnosis</th><th>Suggested fix</th><th>Schedule afterwards</th><th>Observation</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderRuns(d) {
  if (!d.runs.length) {
    $("#runs-body").innerHTML = `<div class="empty">No runs yet. Each <code>python scripts/run_scenario.py &lt;case&gt;</code>
      uploads the file, waits for the scheduled run, validates the output and appends a line here.</div>`;
    return;
  }
  const byRun = Object.fromEntries(d.reports.map((r) => [r.run, r]));
  const caseObs = Object.fromEntries(d.cases.map((c) => [c.case, c.observation]));
  const OUTCOME = { output: ["s-ok", "Output written"], "no-output": ["s-bad", "No output"], "upload-only": ["s-none", "Upload only"], practice: ["s-none", "Practice, no Rhombus"] };
  const rows = [...d.runs].reverse().map((r, i) => {
    const rep = r.run ? byRun[r.run] : null;
    const [cls, label] = OUTCOME[r.outcome] || ["s-none", r.outcome];
    const reportLink = !r.report ? "" : r.report.startsWith("practice/")
      ? `<span class="local">${esc(r.report)} (local only)</span>`
      : `<a href="${blob(r.report)}">Report</a>`;
    const obsDone = d.cases.find((c) => c.case === r.case)?.status === "done";
    const obs = obsDone && caseObs[r.case] ? `<a href="${blob(caseObs[r.case])}">Observation</a>` : "";
    const btn = rep ? `<button class="expand" aria-expanded="false" aria-controls="checks-${i}" data-target="checks-${i}">Checks</button>` : "";
    const detail = rep ? `<tr class="detail" id="checks-${i}" hidden><td colspan="5"><ul class="checks">${rep.checks.map((c) => {
      const s = c.status === "pass" ? chip("s-ok", "pass") : c.status === "warn" ? chip("s-warn", "warn") : chip("s-bad", "fail");
      return `<li>${s}<span class="id">${esc(c.id)}</span><span class="detail">${esc(c.detail)}</span></li>`;
    }).join("")}</ul></td></tr>` : "";
    return `<tr><td class="when">${when(r.uploaded_at || r.output_updated)}</td>
      <td class="case">${esc(r.case || "unknown")}${r.notes ? `<br><span class="local">${esc(r.notes)}</span>` : ""}</td>
      <td>${chip(cls, label)}</td>
      <td>${r.verdict && r.verdict !== "no-output" ? verdictChip(r.verdict, rep?.summary) : ""}</td>
      <td class="links">${[obs, reportLink, btn].filter(Boolean).join(" ")}</td></tr>${detail}`;
  }).join("");
  $("#runs-body").innerHTML = `<table class="runlog"><thead><tr><th>When (Sydney)</th><th>Case</th><th>Rhombus run</th><th>Validator</th><th>Evidence</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  $("#runs-body").addEventListener("click", (e) => {
    const b = e.target.closest("button.expand");
    if (!b) return;
    const row = document.getElementById(b.dataset.target);
    row.hidden = !row.hidden;
    b.setAttribute("aria-expanded", String(!row.hidden));
    b.textContent = row.hidden ? "Checks" : "Hide checks";
  });
}

async function main() {
  let d;
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    d = await res.json();
  } catch (err) {
    $("#meta").textContent = `Could not load data.json (${err.message}). Run python scripts/build_dashboard.py, then serve this folder over HTTP.`;
    return;
  }
  renderMeta(d);
  renderCapability(d);
  renderHealth(d);
  renderTiming(d);
  renderConsistency(d);
  renderBuilder(d);
  renderChatbot(d);
  renderRuns(d);
}

main();
