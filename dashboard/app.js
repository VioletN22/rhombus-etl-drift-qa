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
      <div class="hm-case"><span class="name">${done ? `<a href="${caseHref(c.case)}">${esc(c.case)}</a>` : esc(c.case)}</span><span class="change">${esc(c.change)}</span></div>
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
      <td>${ok ? `<a href="${caseHref(c.case)}">Open case</a>` : `<span class="local">Not written yet</span>`}</td></tr>`;
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
    const obs = obsDone && caseObs[r.case] ? `<a href="${caseHref(r.case)}">Case</a>` : "";
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

// ---- home page ----------------------------------------------------------------

// Plain-language status for a case card: what Rhombus did, not the validator's view.
function caseStatus(c) {
  if (c.status !== "done") return { cls: "s-none", label: "Pending" };
  const cap = c.capability;
  if (cap === "handled") return { cls: "s-ok", label: "Handled" };
  if (cap === "warned") return { cls: "s-warn", label: "Warned" };
  if (cap === "missed") return { cls: "s-bad missed", label: "Silent wrong data" };
  if (cap === "broke") {
    return c.matrix.platform_behaviour === "stopped"
      ? { cls: "s-stop", label: "Stopped (safe)" } : { cls: "s-bad", label: "Broke" };
  }
  if (cap === "unverified") return { cls: "s-none", label: "Not validated" };
  return { cls: "s-none", label: "Pending" };
}
const statusChip = (c, extra = "") => {
  const s = caseStatus(c);
  return chip(s.cls, s.label, extra);
};
const sevChip = (sev) => {
  if (!sev || sev === "na") return "";
  const [cls, label] = SCALE.severity[sev] || ["s-none", sev];
  return chip(cls, label, "sev");
};
const caseHref = (id) => `case.html?id=${encodeURIComponent(id)}`;

function caseTitle(c) {
  const m = /^#\s+(.+)$/m.exec(c.observation_md || "");
  return m ? m[1].replace(/`/g, "") : c.case;
}

function renderStats(d) {
  const s = d.summary;
  const det = s.determinism;
  const stat = (big, label, sub = "") => `<div class="stat"><div class="big">${big}</div>
    <div class="label">${esc(label)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>`;
  $("#stats").innerHTML = [
    stat(`${s.required_done}<span class="of">/${s.required.length}</span>`, "required cases run",
      `${s.required.length - s.required_done} still to run`),
    stat(String(s.critical), "critical findings", "wrong data shipped as a success"),
    stat(det ? `${det.identical}<span class="of">/${det.runs}</span>` : "–", "identical runs",
      det ? `same input, same pipeline (${det.case})` : "no trial yet"),
    stat(String(s.credits_used ?? "–"), "credits used", s.credits_note),
  ].join("");
}

function renderLearnings(d) {
  if (!d.learnings?.length) {
    $("#learnings").innerHTML = `<div class="empty">No learnings yet. Add them under <code>summary.learnings</code> in <code>observations/matrix.yaml</code>.</div>`;
    return;
  }
  $("#learnings").innerHTML = d.learnings.map((l) => {
    const links = l.cases.map((id) => `<a href="${caseHref(id)}">${esc(id)}</a>`).join(", ");
    return `<article class="learning">
      <div class="learning-top">${sevChip(l.severity)}</div>
      <h3>${esc(l.title)}</h3>
      ${l.line ? `<p class="line">${esc(l.line)}</p>` : ""}
      <details><summary>Read more</summary>
        <p>${esc(l.detail)}</p>
        ${links ? `<p class="related">Case${l.cases.length === 1 ? "" : "s"}: ${links}</p>` : ""}
      </details></article>`;
  }).join("");
}

// ---- case tabs (both pages) -------------------------------------------------

const TAB_LABEL = {
  baseline: "Baseline",
  "schema-drop-column": "1 · Drop column",
  "schema-rename-column": "2 · Rename",
  "schema-type-change": "3 · Type change",
  "schema-add-column": "4 · Add column",
  "schema-all-combined": "5 · All combined",
  "semantic-dollars-to-cents": "6 · Dollars → cents",
  "semantic-date-mmdd-to-ddmm": "7 · Date DD/MM",
  "semantic-country-code-swap": "Bonus · Country swap",
};
function tabLabel(c) {
  if (TAB_LABEL[c.case]) return TAB_LABEL[c.case];
  const words = c.case.replace(/^(schema|semantic|edge)-/, "").split("-");
  const name = words.join(" ").replace(/^./, (x) => x.toUpperCase());
  return c.group === "edge" ? `Edge · ${name}` : `Bonus · ${name}`;
}
const tabTip = (c) => (c.status === "done" ? caseStatus(c).label : "Not run yet");

function renderTabs(d, current) {
  const shown = d.cases.filter((c) => c.status === "done" || c.case === "baseline" ||
    d.summary.required.includes(c.case));
  const cur = (key) => (key === current ? ` aria-current="page"` : "");
  const caseTabs = shown.map((c) => {
    const s = caseStatus(c);
    const tip = tabTip(c);
    return `<a class="tab ${c.status === "done" ? "" : "pending"}" href="${caseHref(c.case)}" title="${esc(tip)}"${cur(c.case)}>` +
      `<span class="tab-dot ${s.cls}" aria-hidden="true"></span>${esc(tabLabel(c))}` +
      `<span class="visually-hidden">, ${esc(tip)}</span></a>`;
  }).join("");
  $("#tabs").innerHTML = `<div class="wrap"><div class="tab-row">
    <a class="tab" href="./"${cur("overview")}>Overview</a><span class="tab-sep" aria-hidden="true"></span>
    ${caseTabs}<span class="tab-sep" aria-hidden="true"></span>
    <a class="tab" href="./#metrics" data-metrics${cur("metrics")}>Metrics</a></div></div>`;
  showActiveTab();
}

// On narrow screens, scroll the bar (never the page) so the active tab is visible.
function showActiveTab() {
  const row = $("#tabs .tab-row");
  const a = row?.querySelector('[aria-current="page"]');
  if (!a) return;
  if (a.offsetLeft < row.scrollLeft || a.offsetLeft + a.offsetWidth > row.scrollLeft + row.clientWidth) {
    row.scrollLeft = a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2;
  }
}

function setHomeTab() {
  const metrics = location.hash === "#metrics" || ($("#metrics")?.contains(document.getElementById(location.hash.slice(1))) ?? false);
  document.querySelectorAll("#tabs .tab").forEach((a) => a.removeAttribute("aria-current"));
  const a = metrics ? $("#tabs [data-metrics]") : $('#tabs a[href="./"]');
  a?.setAttribute("aria-current", "page");
  showActiveTab();
}

function openMetricsForHash() {
  const id = location.hash.slice(1);
  const target = id && document.getElementById(id);
  const box = $("#metrics");
  if (target && box && box.contains(target)) {
    box.open = true;
    // After fonts and layout settle, or the browser's own fragment jump wins.
    const go = () => target.scrollIntoView({ behavior: "instant", block: "start" });
    requestAnimationFrame(go);
    document.fonts?.ready.then(() => setTimeout(go, 50));
  }
}

// ---- case page ----------------------------------------------------------------

const FACT = {
  stopped: { stopped: ["s-stop", "Yes, it stopped"], warned: ["s-warn", "Warned, kept going"], carried_on: ["s-none", "No, ran to the end"] },
  gcs: { yes: ["s-none", "Yes"], no: ["s-ok", "No"] },
};

const mdInline = (s) => (window.marked && window.DOMPurify
  ? DOMPurify.sanitize(marked.parseInline(s)) : esc(s));
const normKey = (s) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

// The write-ups open with a two-column `| | |` table of facts before the first H2.
// Pull it out so it can sit in the "At a glance" card instead of the prose.
function splitObservation(md) {
  const body = md.replace(/^#\s+.+\n+/, ""); // title is already the page heading
  const first = body.search(/^##\s/m);
  let pre = first < 0 ? body : body.slice(0, first);
  const rest = first < 0 ? "" : body.slice(first);
  const facts = [];
  const lines = pre.split("\n");
  const start = lines.findIndex((l) => /^\|\s*\|\s*\|\s*$/.test(l.trim()));
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && lines[end].trim().startsWith("|")) {
      const cells = lines[end].trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((x) => x.trim());
      if (!/^-+$/.test(cells[0] || "") && cells[0]) facts.push([cells[0], cells.slice(1).join(" | ")]);
      end += 1;
    }
    lines.splice(start, end - start);
    pre = lines.join("\n");
  }
  const sections = [];
  if (pre.trim()) sections.push({ title: "", md: pre });
  for (const chunk of rest.split(/^(?=##\s)/m)) {
    if (!chunk.trim()) continue;
    const m = /^##\s+(.+)\n?([\s\S]*)$/.exec(chunk);
    sections.push({ title: m[1].trim(), md: m[2] });
  }
  return { facts, sections };
}

function renderFacts(c, mdFacts) {
  const m = c.matrix;
  const pick = (map, v) => (v && map[v] ? chip(map[v][0], map[v][1]) : `<span class="quiet">not recorded</span>`);
  // Output reaching GCS is only good news if the output is right.
  let gcs = pick(FACT.gcs, m.gcs_output);
  if (m.gcs_output === "yes") {
    gcs = c.capability === "handled" ? chip("s-ok", "Yes") : c.capability === "missed"
      ? chip("s-bad missed", "Yes, wrong data") : chip("s-none", "Yes");
  }
  const isBase = c.case === "baseline";
  const outcome = [
    ["Rhombus run", m.rhombus_status ? chip(m.rhombus_status === "Success" ? "s-ok" : "s-bad", m.rhombus_status) : `<span class="quiet">not recorded</span>`],
    ["Pipeline stopped?", pick(FACT.stopped, m.platform_behaviour)],
    ["Output reached GCS?", gcs],
    ["Logs clear?", scaleChip("logs_clear", m.logs_clear, true)],
  ];
  if (!isBase) {
    outcome.push(["Chatbot diagnosis", scaleChip("chatbot_diagnosis", m.chatbot_diagnosis, true)]);
    outcome.push(["Chatbot fix worked?", scaleChip("chatbot_fix_worked", m.chatbot_fix_worked, true)]);
  }
  if (sevChip(m.severity)) outcome.push(["Severity", sevChip(m.severity)]);
  if (typeof m.credits_used === "number") outcome.push(["Credits", `<span class="num">${m.credits_used}</span>`]);
  // A write-up row with the same label adds its wording under the chip, so nothing shows twice.
  const notes = new Map(mdFacts.map(([k, v]) => [normKey(k), v]));
  const used = new Set();
  const row = (k, v, note = "") => `<div class="fact"><dt>${esc(k)}</dt><dd>${v}${note ? `<span class="note">${note}</span>` : ""}</dd></div>`;
  const top = outcome.map(([k, v]) => {
    const n = notes.get(normKey(k));
    if (n !== undefined) used.add(normKey(k));
    return row(k, v, n ? mdInline(n) : "");
  });
  if (m.schedule_after && !notes.has("schedule")) mdFacts = [...mdFacts, ["Schedule", esc(m.schedule_after)]];
  const details = mdFacts.filter(([k]) => !used.has(normKey(k)))
    .map(([k, v]) => row(k, `<span class="plain">${mdInline(v)}</span>`));
  $("#facts").innerHTML = `<dl class="facts">${top.join("")}</dl>` +
    (details.length ? `<h3 class="facts-sub">Run details</h3><dl class="facts details">${details.join("")}</dl>` : "");
}

const EVIDENCE_HREF = /^(?:\.\/)?(?:observations\/)?evidence\/([^\s/]+)$/;
const REPORT_HREF = /^(?:data-validation\/)?reports\/([^\s/]+)\.json$/;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp)$/i;

// Section kinds by heading. size "short" cards may share a row with a neighbour.
const ICON = {
  changed: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  expected: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  happened: '<path d="M5 4v16"/><path d="M5 5h11l-2 4 2 4H5"/>',
  logs: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  chatbot: '<path d="M4 5h16v11H9l-5 4z"/>',
  schedule: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  destination: '<path d="M4 12h11"/><path d="M11 8l4 4-4 4"/><path d="M15 4h5v16h-5"/>',
  validator: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  reproduce: '<path d="M5 12a7 7 0 1 0 2-5"/><path d="M5 4v4h4"/>',
  impact: '<path d="M12 4v10"/><path d="M12 18v2"/><path d="M5 20h14L12 4z" fill="none"/>',
  question: '<circle cx="12" cy="12" r="8"/><path d="M10 10a2 2 0 1 1 3 1.7c-.7.4-1 .9-1 1.6"/><path d="M12 16.5v.5"/>',
  evidence: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
  checks: '<path d="M5 7h3M5 12h3M5 17h3"/><path d="M11 7h8M11 12h8M11 17h8"/>',
  glance: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  note: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h6"/>',
};
const KINDS = [
  [/^what i changed/i, "changed", "short"],
  [/^expected/i, "expected", "short"],
  [/^what happened/i, "happened", "long"],
  [/^logs?\b/i, "logs", "long"],
  [/chatbot/i, "chatbot", "long"],
  [/^schedule/i, "schedule", "short"],
  [/destination/i, "destination", "long"],
  [/^validator/i, "validator", "long"],
  [/^reproduce/i, "reproduce", "short"],
  [/^impact/i, "impact", "long"],
  [/^who decided|\?/i, "question", "long"],
];
const kindOf = (title) => {
  for (const [re, kind, size] of KINDS) if (re.test(title)) return { kind, size };
  return { kind: "note", size: "long" };
};
const glyph = (kind) => `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">${ICON[kind] || ICON.note}</svg>`;
const cardHead = (kind, title, id) => `<div class="card-head">${glyph(kind)}<h2${id ? ` id="${id}"` : ""}>${mdInline(title)}</h2></div>`;

function postProcess(el, c) {
  const evidence = new Set(c.evidence.map((e) => e.name));
  const reports = new Set(c.page_reports.map((r) => r.run));
  // Code spans that name a file we publish become links.
  el.querySelectorAll("code").forEach((code) => {
    if (code.closest("a, pre")) return;
    const text = code.textContent.trim();
    let href = null;
    const ev = EVIDENCE_HREF.exec(text);
    if (ev && (evidence.has(ev[1]) || ALL_EVIDENCE.has(ev[1]))) href = `evidence/${ev[1]}`;
    const rep = REPORT_HREF.exec(text);
    if (rep && reports.has(rep[1])) href = `#report-${rep[1]}`;
    if (!href) return;
    const a = document.createElement("a");
    a.href = href;
    if (href.startsWith("evidence/")) { a.target = "_blank"; a.rel = "noopener"; }
    code.replaceWith(a);
    a.appendChild(code);
  });
  // Relative markdown links: evidence resolves locally, everything else to GitHub.
  el.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (/^(?:[a-z]+:|#|evidence\/)/i.test(href)) return;
    const base = c.observation.split("/").slice(0, -1).join("/");
    const ev = EVIDENCE_HREF.exec(href);
    if (ev) { a.href = `evidence/${ev[1]}`; a.target = "_blank"; a.rel = "noopener"; return; }
    const parts = `${base}/${href}`.split("/");
    const out = [];
    for (const p of parts) { if (p === "..") out.pop(); else if (p && p !== ".") out.push(p); }
    a.href = blob(out.join("/"));
  });
  el.querySelectorAll("table").forEach((t) => {
    if (t.parentElement.classList.contains("scroll-x")) return;
    const wrap = document.createElement("div");
    wrap.className = "scroll-x";
    t.replaceWith(wrap);
    wrap.appendChild(t);
    const head = t.querySelector("thead");
    if (head && !head.textContent.trim()) { head.remove(); t.classList.add("kv"); }
  });
  // Verbatim errors read as code; quotes from people or the chatbot stay in prose.
  el.querySelectorAll("blockquote").forEach((q) => {
    const t = q.textContent;
    const isError = /error|failed|exception|traceback|keyerror|---|code_sha|pipeline execution/i.test(t);
    q.classList.add("callout", isError ? "callout-error" : "callout-quote");
  });
}

// Small thumbnails for screenshots the card links to.
function thumbs(el) {
  const seen = new Set();
  const items = [];
  el.querySelectorAll('a[href^="evidence/"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!IMAGE_EXT.test(href) || seen.has(href)) return;
    seen.add(href);
    items.push(`<a class="thumb" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(prettyName(href.split("/").pop()))}">
      <img src="${esc(href)}" alt="${esc(prettyName(href.split("/").pop()))}" loading="lazy"></a>`);
  });
  if (!items.length) return;
  const div = document.createElement("div");
  div.className = "thumbs";
  div.innerHTML = items.join("");
  el.appendChild(div);
}

function renderMarkdown(el, md, c) {
  if (window.marked && window.DOMPurify) {
    el.innerHTML = DOMPurify.sanitize(marked.parse(md));
    postProcess(el, c);
  } else {
    el.innerHTML = `<pre class="raw">${esc(md)}</pre>`;
  }
}

function sectionCard(s, c, n) {
  const { kind, size } = kindOf(s.title);
  const card = document.createElement("section");
  card.className = `card k-${kind}`;
  const id = `sec-${n}`;
  card.setAttribute("aria-labelledby", id);
  card.innerHTML = (s.title ? cardHead(kind, s.title, id) : "") + `<div class="prose"></div>`;
  if (!s.title) card.removeAttribute("aria-labelledby");
  renderMarkdown(card.querySelector(".prose"), s.md, c);
  thumbs(card.querySelector(".prose"));
  return { card, kind, size };
}

function renderSections(c, sections) {
  const host = $("#observation");
  host.innerHTML = "";
  if (!window.marked || !window.DOMPurify) {
    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `<div class="prose"><pre class="raw">${esc(c.observation_md)}</pre></div>`;
    host.appendChild(card);
    return;
  }
  const cards = sections.map((s, i) => sectionCard(s, c, i));
  for (let i = 0; i < cards.length; i += 1) {
    const a = cards[i];
    const b = cards[i + 1];
    // Expected and What happened sit in one card, side by side.
    if (a.kind === "expected" && b?.kind === "happened") {
      const pair = document.createElement("div");
      pair.className = "card pair";
      for (const x of [a, b]) { x.card.classList.remove("card"); x.card.classList.add("half"); pair.appendChild(x.card); }
      host.appendChild(pair);
      i += 1;
      continue;
    }
    // Two short cards in a row share it; a short card alone takes the full width.
    if (a.size === "short" && b?.size === "short" && b.kind !== "expected") {
      const row = document.createElement("div");
      row.className = "row2";
      row.append(a.card, b.card);
      host.appendChild(row);
      i += 1;
      continue;
    }
    host.appendChild(a.card);
  }
}
let ALL_EVIDENCE = new Set();

function prettyName(name) {
  return name.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
}

function renderEvidence(c) {
  if (!c.evidence.length) {
    $("#evidence-body").innerHTML = `<div class="empty">No evidence files match this case. Files in <code>observations/evidence/</code> are matched by name; set <code>evidence_keywords</code> in <code>matrix.yaml</code> to widen the match.</div>`;
    return;
  }
  const imgs = c.evidence.filter((e) => e.kind === "image");
  const texts = c.evidence.filter((e) => e.kind !== "image");
  const gallery = imgs.length ? `<div class="gallery">${imgs.map((e) => `<figure>
      <a href="${esc(e.path)}" target="_blank" rel="noopener"><img src="${esc(e.path)}" alt="${esc(prettyName(e.name))}" loading="lazy"></a>
      <figcaption>${esc(prettyName(e.name))}</figcaption></figure>`).join("")}</div>` : "";
  const files = texts.length ? `<div class="files">${texts.map((e) => `<details class="file" data-src="${esc(e.path)}">
      <summary><span class="ext">${esc(e.ext)}</span><span class="fname">${esc(prettyName(e.name))}</span></summary>
      <pre>Loading</pre><p class="file-link"><a href="${esc(e.path)}" target="_blank" rel="noopener">Open raw file</a></p></details>`).join("")}</div>` : "";
  $("#evidence-body").innerHTML = gallery + files;
  $("#evidence-body").addEventListener("toggle", async (ev) => {
    const box = ev.target;
    if (!box.matches?.("details.file") || !box.open || box.dataset.loaded) return;
    box.dataset.loaded = "1";
    const pre = box.querySelector("pre");
    try {
      const res = await fetch(box.dataset.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let text = await res.text();
      if (box.dataset.src.endsWith(".json")) {
        try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* show as is */ }
      }
      pre.textContent = text;
    } catch (err) {
      pre.textContent = `Could not load (${err.message}).`;
    }
  }, true);
}

function renderChecks(c) {
  if (!c.page_reports.length) {
    $("#checks-body").innerHTML = `<div class="empty">No validator report for this case yet.</div>`;
    return;
  }
  $("#checks-body").innerHTML = c.page_reports.map((r, i) => {
    const order = { fail: 0, warn: 1, pass: 2 };
    const checks = [...r.checks].sort((a, b) => order[a.status] - order[b.status]);
    const rows = checks.map((k) => {
      const s = k.status === "pass" ? chip("s-ok", "pass") : k.status === "warn" ? chip("s-warn", "warn") : chip("s-bad", "fail");
      return `<tr><td>${s}</td><td class="id">${esc(k.id)}</td><td class="detail">${esc(k.detail)}</td></tr>`;
    }).join("");
    const s = r.summary;
    const counts = `${s.fail} fail, ${s.warn} warn, ${s.pass} pass`;
    const note = r.listed ? "" : `<span class="note">also matched to this case</span>`;
    return `<details class="report" id="report-${esc(r.run)}" ${i === 0 ? "open" : ""}>
      <summary><span class="run mono">${esc(r.run)}</span>${verdictChip(r.verdict, r.summary)}
        <span class="counts">${counts}, ${r.output_rows} of ${r.input_rows} rows out</span>${note}</summary>
      <div class="scroll-x"><table class="check-table"><thead><tr><th>Result</th><th>Check</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="file-link"><a href="${blob(r.path)}">Full report on GitHub</a></p>
    </details>`;
  }).join("");
}

function renderPager(d, c) {
  const done = d.cases.filter((x) => x.status === "done");
  const list = done.some((x) => x.case === c.case) ? done : d.cases;
  const i = list.findIndex((x) => x.case === c.case);
  const prev = list[i - 1];
  const next = list[i + 1];
  $("#pager").innerHTML = `${prev ? `<a class="prev" href="${caseHref(prev.case)}"><span class="dir">← Previous</span><span class="mono">${esc(prev.case)}</span></a>` : "<span></span>"}
    <a class="home" href="./">Overview</a>
    ${next ? `<a class="next" href="${caseHref(next.case)}"><span class="dir">Next →</span><span class="mono">${esc(next.case)}</span></a>` : "<span></span>"}`;
}

function renderCase(d) {
  const id = new URLSearchParams(location.search).get("id");
  const c = d.cases.find((x) => x.case === id);
  $("#repo-link").href = GITHUB_BASE;
  renderTabs(d, c ? c.case : null);
  if (!c) {
    $("#case-title").textContent = "Case not found";
    $("#case-missing").hidden = false;
    $("#case-missing").innerHTML = `No case called <code>${esc(id || "")}</code>. <a href="./">Back to the overview</a>.`;
    return;
  }
  ALL_EVIDENCE = new Set(d.evidence_files || []);
  const title = caseTitle(c);
  document.title = `${c.case} · Rhombus Drift QA`;
  $("#crumb-case").textContent = c.case;
  $("#case-title").textContent = title;
  $("#case-slug").textContent = title === c.case ? "" : c.case;
  $("#case-change").innerHTML = `<span class="k">What changed</span> ${esc(c.change)}`;
  renderPager(d, c);
  if (c.status !== "done") {
    $("#case-chips").innerHTML = chip("s-none", "Not run yet", "big");
    $("#case-missing").hidden = false;
    $("#case-missing").innerHTML = `<strong>Not run yet.</strong> This case has not been run against Rhombus yet. Its write-up will appear here once <code>${esc(c.observation)}</code> exists and the case is marked <code>done</code> in <code>observations/matrix.yaml</code>.`;
    return;
  }
  $("#case-chips").innerHTML = statusChip(c, "big") + sevChip(c.matrix.severity);
  $("#case-headline").textContent = c.headline || "";
  $("#case-body").hidden = false;
  const obs = c.observation_md ? splitObservation(c.observation_md) : { facts: [], sections: [] };
  renderFacts(c, obs.facts);
  if (c.observation_md) renderSections(c, obs.sections);
  else $("#observation").innerHTML = `<section class="card"><div class="empty">No write-up found at <code>${esc(c.observation)}</code>.</div></section>`;
  $("#obs-source").innerHTML = `Source: <a href="${blob(c.observation)}">${esc(c.observation)}</a>`;
  const extra = c.extra_md || [];
  $("#extra").hidden = !extra.length;
  $("#extra-body").innerHTML = extra.map((x, i) => {
    const t = /^#\s+(.+)$/m.exec(x.md);
    return `<details class="extra-md"><summary>${esc(t ? t[1] : x.path)}</summary><article class="prose" id="extra-${i}"></article></details>`;
  }).join("");
  extra.forEach((x, i) => renderMarkdown(document.getElementById(`extra-${i}`), x.md.replace(/^#\s+.+\n+/, ""), { ...c, observation: x.path }));
  renderEvidence(c);
  renderChecks(c);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

// ---- boot -----------------------------------------------------------------------

async function main() {
  const page = document.body.dataset.page;
  let d;
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    d = await res.json();
  } catch (err) {
    const msg = `Could not load data.json (${err.message}). Run python scripts/build_dashboard.py, then serve this folder over HTTP.`;
    const el = $("#meta") || $("#case-title");
    if (el) el.textContent = msg;
    return;
  }
  if (page === "case") {
    renderCase(d);
    return;
  }
  renderMeta(d);
  $("#verdict").textContent = d.verdict || "";
  renderStats(d);
  renderLearnings(d);
  renderTabs(d, "overview");
  renderCapability(d);
  renderHealth(d);
  renderTiming(d);
  renderConsistency(d);
  renderBuilder(d);
  renderChatbot(d);
  renderRuns(d);
  openMetricsForHash();
  setHomeTab();
  window.addEventListener("hashchange", () => { openMetricsForHash(); setHomeTab(); });
  $("#metrics").addEventListener("toggle", () => {
    if (!$("#metrics").open && location.hash) history.replaceState(null, "", location.pathname);
    setHomeTab();
  });
  $("#tabs [data-metrics]").addEventListener("click", (e) => {
    if (location.hash !== "#metrics") return;
    e.preventDefault(); // same hash: no hashchange, so open and jump by hand
    openMetricsForHash();
  });
}

main();
