const express = require("express");
const path = require("path");
const { parseQuestion } = require("./lib/parser");
const { parseQuestionWithGemini } = require("./lib/llmParser");
const { runBacktest } = require("./lib/backtest");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));


app.post("/api/parse", async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "question is required" });
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await parseQuestionWithGemini(question);
      return res.json(result);
    } catch (err) {
      console.error("Gemini parse failed, falling back to rule-based parser:", err.message);
    }
  }

  const result = parseQuestion(question);
  result.source = "rules";
  res.json(result);
});


app.post("/api/clarify", (req, res) => {
  const { experiment, answers } = req.body;
  if (!experiment) return res.status(400).json({ error: "experiment is required" });

  const updated = JSON.parse(JSON.stringify(experiment));

  if (answers?.thresholdPercent != null) {
    updated.entry.thresholdPercent = Number(answers.thresholdPercent);
  }
  if (answers?.holdingPeriodDays != null) {
    updated.holdingPeriodDays = Number(answers.holdingPeriodDays);
  }
  if (answers?.instrument) {
    updated.instrument = answers.instrument;
  }
  if (answers?.target != null || answers?.stopLoss != null) {
    updated.exit = {
      target: answers.target != null ? Number(answers.target) : null,
      stopLoss: answers.stopLoss != null ? Number(answers.stopLoss) : null,
    };
  }


  const stillMissing = [];
  if (updated.entry.thresholdPercent == null) {
    stillMissing.push({ field: "entry.thresholdPercent", question: "What size move qualifies as the entry trigger?" });
  }
  if (updated.holdingPeriodDays == null) {
    stillMissing.push({ field: "holdingPeriodDays", question: "How many days should the position be held?" });
  }

  res.json({ experiment: updated, missing: stillMissing });
});


app.post("/api/test", (req, res) => {
  const { experiment } = req.body;
  if (!experiment) return res.status(400).json({ error: "experiment is required" });
  if (experiment.entry.thresholdPercent == null || experiment.holdingPeriodDays == null) {
    return res.status(400).json({ error: "experiment is incomplete — resolve missing fields before testing" });
  }

  const stats = runBacktest(experiment);

  const hasEdge = stats.edgeVsBaselinePercent > 0.3 && stats.tradeCount >= 10;
  const lowSample = stats.tradeCount < 10;

  const learn = {
    stats,
    whatDataShows: `Across ${stats.tradeCount} historical instances matching the entry rule, the average net return was ${stats.avgNetReturnPercent}% over ${experiment.holdingPeriodDays} days, versus ${stats.baselineAvgReturnPercent}% for a random buy-and-hold window of the same length.`,
    whatWeConclude: lowSample
      ? "The sample size is too small to draw a reliable conclusion. This result should be treated as inconclusive, not as evidence of an edge either way."
      : hasEdge
      ? "The rule shows a modest edge over a naive baseline in this sample. This is a hint worth investigating further, not proof — it is one dataset, one cost assumption, and one parameter set."
      : "The rule does not show a meaningful edge over simply holding the market for the same period in this sample.",
    nextQuestions: [
      "Does the edge hold if the threshold or holding period is changed slightly (sensitivity check)?",
      "Is the result concentrated in a few outlier trades, or spread across many?",
      "How sensitive is the result to slippage and transaction cost assumptions?",
      "Does the same rule hold on real historical data, not synthetic sample data?",
    ],
    caveats: [
      "This uses synthetic sample data generated for this prototype, not real NIFTY history.",
      "No look-ahead bias was intentionally introduced (entry is priced the day after the signal), but this has not been independently verified.",
      "Overfitting risk: parameters were not optimized here, but a real system must guard against tuning thresholds to fit the past.",
    ],
  };

  res.json(learn);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AI Trading Research Assistant backend running on port ${PORT}`);
});
