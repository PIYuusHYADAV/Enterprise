let currentExperiment = null;
let currentMissing = [];

const el = (id) => document.getElementById(id);

function setStep(name) {
  document.querySelectorAll(".step").forEach((s) => {
    s.classList.toggle("active", s.dataset.step === name);
  });
}

function showSection(id) {
  ["ask-section", "clarify-section", "define-section", "learn-section"].forEach((s) => {
    el(s).classList.toggle("hidden", s !== id);
  });
}

// ---------- STEP 1: ASK ----------
el("ask-btn").addEventListener("click", async () => {
  const question = el("question").value.trim();
  if (!question) return alert("Please enter a question.");

  const res = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const data = await res.json();
  currentExperiment = data.experiment;
  currentMissing = data.missing;

  const badge = document.getElementById("source-badge");
  if (badge) {
    badge.textContent = data.source === "gemini" ? "Parsed by Gemini" : "Parsed by rule-based fallback";
  }

  if (data.missing.length > 0) {
    renderClarify(data);
    setStep("clarify");
    showSection("clarify-section");
  } else {
    renderExperiment(currentExperiment);
    setStep("define");
    showSection("define-section");
  }
});

// ---------- STEP 2: CLARIFY ----------
function renderClarify(data) {
  el("assumptions-box").innerHTML =
    "<strong>Assumptions made so far:</strong><ul>" +
    data.assumptions.map((a) => `<li>${a}</li>`).join("") +
    "</ul>";

  const form = el("clarify-form");
  form.innerHTML = "";
  data.missing.forEach((m) => {
    const wrapper = document.createElement("div");
    wrapper.className = "field-group";
    wrapper.innerHTML = `
      <label>${m.question}</label>
      <input type="text" data-field="${m.field}" placeholder="Type your answer" />
    `;
    form.appendChild(wrapper);
  });
}

el("clarify-btn").addEventListener("click", async () => {
  const inputs = document.querySelectorAll("#clarify-form input");
  const answers = {};
  inputs.forEach((inp) => {
    const field = inp.dataset.field;
    const val = inp.value.trim();
    if (!val) return;
    if (field === "entry.thresholdPercent") answers.thresholdPercent = val;
    if (field === "holdingPeriodDays") answers.holdingPeriodDays = val;
    if (field === "instrument") answers.instrument = val;
  });

  const res = await fetch("/api/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experiment: currentExperiment, answers }),
  });
  const data = await res.json();
  currentExperiment = data.experiment;

  if (data.missing.length > 0) {
    // still missing something critical — ask again rather than guessing
    renderClarify({ assumptions: ["Some required fields are still missing."], missing: data.missing });
  } else {
    renderExperiment(currentExperiment);
    setStep("define");
    showSection("define-section");
  }
});

// ---------- STEP 3: DEFINE ----------
function renderExperiment(exp) {
  el("experiment-box").innerHTML = `
    <table>
      <tr><td>Instrument</td><td>${exp.instrument}</td></tr>
      <tr><td>Timeframe</td><td>${exp.timeframe}</td></tr>
      <tr><td>Entry condition</td><td>${exp.instrument} ${exp.entry.direction}s &ge; ${exp.entry.thresholdPercent}%</td></tr>
      <tr><td>Filters</td><td>${exp.filters.length ? exp.filters.join(", ") : "None"}</td></tr>
      <tr><td>Exit</td><td>${
        exp.exit.target || exp.exit.stopLoss
          ? `Target: ${exp.exit.target ?? "-"}%, Stop-loss: ${exp.exit.stopLoss ?? "-"}%`
          : "Time-based only"
      }</td></tr>
      <tr><td>Holding period</td><td>${exp.holdingPeriodDays} days</td></tr>
      <tr><td>Test period</td><td>${exp.testPeriod}</td></tr>
      <tr><td>Cost assumptions</td><td>Slippage ${exp.costAssumptions.slippagePercent}% + Transaction ${exp.costAssumptions.transactionCostPercent}%</td></tr>
      <tr><td>Hypothesis</td><td>${exp.hypothesis}</td></tr>
    </table>
  `;
}

el("test-btn").addEventListener("click", async () => {
  const res = await fetch("/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experiment: currentExperiment }),
  });
  const data = await res.json();
  renderLearn(data);
  setStep("learn");
  showSection("learn-section");
});

// ---------- STEP 4: LEARN ----------
function renderLearn(learn) {
  const s = learn.stats;
  el("learn-box").innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="label">Trades found</div><div class="value">${s.tradeCount}</div></div>
      <div class="stat-box"><div class="label">Win rate</div><div class="value">${s.winRate}%</div></div>
      <div class="stat-box"><div class="label">Avg net return</div><div class="value">${s.avgNetReturnPercent}%</div></div>
      <div class="stat-box"><div class="label">Edge vs baseline</div><div class="value">${s.edgeVsBaselinePercent}%</div></div>
    </div>

    <div class="section-title">What the data shows</div>
    <p>${learn.whatDataShows}</p>

    <div class="section-title">What we can reasonably conclude</div>
    <p>${learn.whatWeConclude}</p>

    <div class="section-title">What to investigate next</div>
    <ul>${learn.nextQuestions.map((q) => `<li>${q}</li>`).join("")}</ul>

    <div class="section-title">Caveats</div>
    <ul>${learn.caveats.map((c) => `<li>${c}</li>`).join("")}</ul>
  `;
}

el("restart-btn").addEventListener("click", () => {
  currentExperiment = null;
  currentMissing = [];
  el("question").value = "";
  setStep("ask");
  showSection("ask-section");
});
