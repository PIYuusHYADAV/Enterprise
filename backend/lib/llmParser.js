const MODEL = "gemini-2.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are a research assistant that converts a natural-language trading question into a structured experiment definition.

Return ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:

{
  "instrument": string,               // e.g. "NIFTY". If not mentioned, use "NIFTY" and set instrumentAssumed=true
  "instrumentAssumed": boolean,
  "timeframe": "Daily" | "Weekly",
  "entry": {
    "direction": "fall" | "rise",
    "thresholdPercent": number | null,   // null if genuinely not derivable from the text
    "thresholdAssumed": boolean,         // true if you had to infer a number from vague language like "sharp fall"
    "thresholdAssumedReason": string | null
  },
  "filters": string[],                 // e.g. ["high_volatility"] if mentioned or implied, else []
  "exit": {
    "target": number | null,
    "stopLoss": number | null
  },
  "holdingPeriodDays": number | null,  // null if not mentioned — do NOT guess this
  "hypothesis": string                 // one sentence stating what is being tested
}

Rules:
- Never invent a holdingPeriodDays value. If the user didn't specify it, return null.
- If the question uses vague magnitude language ("sharp", "big", "steep", "significant") without a number, you may propose a reasonable numeric threshold, but you MUST set thresholdAssumed=true and explain your reasoning in thresholdAssumedReason.
- If the question gives an explicit percentage, use it exactly and set thresholdAssumed=false.
- Output must be valid JSON only.`;

async function callGemini(question) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${SYSTEM_PROMPT}\n\nUser question: "${question}"` }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content");
  }

  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function toAppShape(llmResult, rawQuestion) {
  const experiment = {
    instrument: llmResult.instrument || "NIFTY",
    timeframe: llmResult.timeframe || "Daily",
    entry: {
      direction: llmResult.entry?.direction || "fall",
      thresholdPercent: llmResult.entry?.thresholdPercent ?? null,
    },
    filters: llmResult.filters || [],
    exit: {
      target: llmResult.exit?.target ?? null,
      stopLoss: llmResult.exit?.stopLoss ?? null,
    },
    holdingPeriodDays: llmResult.holdingPeriodDays ?? null,
    testPeriod: "Last 3 years (sample dataset)",
    costAssumptions: {
      slippagePercent: 0.05,
      transactionCostPercent: 0.03,
      note: "Default estimates for Indian index trades. Not user-specified — shown for transparency, editable in a future version.",
    },
    hypothesis:
      llmResult.hypothesis ||
      `Testing whether ${llmResult.instrument || "NIFTY"} shows an edge after a ${llmResult.entry?.direction || "fall"}.`,
  };

  const missing = [];
  if (experiment.entry.thresholdPercent == null) {
    missing.push({
      field: "entry.thresholdPercent",
      question: "What size move counts as a qualifying fall? (e.g. 1%, 2%, 3%)",
    });
  }
  if (experiment.holdingPeriodDays == null) {
    missing.push({
      field: "holdingPeriodDays",
      question: "How many days should the position be held before exiting?",
    });
  }
  if (llmResult.instrumentAssumed) {
    missing.push({
      field: "instrument",
      question:
        "I assumed NIFTY since no instrument was named — is that correct?",
    });
  }

  const assumptions = [];
  if (llmResult.entry?.thresholdAssumed) {
    assumptions.push(
      llmResult.entry.thresholdAssumedReason ||
        `The AI inferred a ${experiment.entry.thresholdPercent}% threshold from vague language — please confirm or change it.`,
    );
  }
  if (llmResult.instrumentAssumed) {
    assumptions.push(
      "Instrument defaulted to NIFTY because none was mentioned in the question.",
    );
  }
  assumptions.push(
    "Cost assumptions (slippage 0.05%, transaction cost 0.03%) are placeholder defaults, not derived from the question.",
  );

  return { experiment, missing, assumptions, rawQuestion, source: "gemini" };
}

async function parseQuestionWithGemini(question) {
  const raw = await callGemini(question);
  return toAppShape(raw, question);
}

module.exports = { parseQuestionWithGemini };
