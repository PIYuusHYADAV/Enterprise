

const KNOWN_INSTRUMENTS = ["NIFTY", "BANKNIFTY", "SENSEX"];

function detectInstrument(text) {
  const upper = text.toUpperCase();
  for (const inst of KNOWN_INSTRUMENTS) {
    if (upper.includes(inst)) return inst;
  }
  return null;
}

function detectFallThreshold(text) {
  // Look for an explicit number, e.g. "1%", "2 percent", "falls by 3%"
  const explicit = text.match(/(\d+(\.\d+)?)\s*%/);
  if (explicit) {
    return { value: parseFloat(explicit[1]), assumed: false };
  }

  
  if (/sharp|big|large|steep|significant/i.test(text) && /fall|drop|decline|crash/i.test(text)) {
    return { value: 2.0, assumed: true };
  }

  return null;
}

function detectDirection(text) {
  if (/fall|drop|decline|crash|dip/i.test(text)) return "fall";
  if (/rise|rally|gain|jump/i.test(text)) return "rise";
  return null;
}

function detectHoldingPeriod(text) {
  const daysMatch = text.match(/(\d+)\s*(day|days)/i);
  if (daysMatch) return { value: parseInt(daysMatch[1], 10), unit: "days", assumed: false };

  const weeksMatch = text.match(/(\d+)\s*(week|weeks)/i);
  if (weeksMatch) return { value: parseInt(weeksMatch[1], 10) * 5, unit: "days", assumed: false };

  return null; // genuinely missing, don't guess
}

function detectTimeframe(text) {
  if (/weekly/i.test(text)) return "Weekly";
  if (/daily|day/i.test(text)) return "Daily";
  return null;
}

function detectVolatilityFilter(text) {
  return /high[\s-]?volatility|volatile/i.test(text);
}

function detectExit(text) {
  const targetMatch = text.match(/target\s*(of)?\s*(\d+(\.\d+)?)\s*%/i);
  const stopMatch = text.match(/stop\s*(loss)?\s*(of)?\s*(\d+(\.\d+)?)\s*%/i);
  if (targetMatch || stopMatch) {
    return {
      target: targetMatch ? parseFloat(targetMatch[2]) : null,
      stopLoss: stopMatch ? parseFloat(stopMatch[3]) : null,
    };
  }
  return null;
}

/**
 * Main entry point: question (string) -> { experiment, missing, assumptions }
 */
function parseQuestion(question) {
  const instrument = detectInstrument(question) || "NIFTY"; // default, but flagged below if it was a guess
  const instrumentWasGuessed = !detectInstrument(question);

  const direction = detectDirection(question);
  const threshold = detectFallThreshold(question);
  const holdingPeriod = detectHoldingPeriod(question);
  const timeframe = detectTimeframe(question) || "Daily";
  const volatilityFilter = detectVolatilityFilter(question);
  const exit = detectExit(question);

  const experiment = {
    instrument,
    timeframe,
    entry: {
      direction: direction || "fall",
      thresholdPercent: threshold ? threshold.value : null,
    },
    filters: volatilityFilter ? ["high_volatility"] : [],
    exit: exit || { target: null, stopLoss: null },
    holdingPeriodDays: holdingPeriod ? holdingPeriod.value : null,
    testPeriod: "Last 3 years (sample dataset)",
    costAssumptions: {
      slippagePercent: 0.05,
      transactionCostPercent: 0.03,
      note: "Default estimates for Indian index trades. Not user-specified — shown for transparency, editable in a future version.",
    },
    hypothesis: `${instrument} shows a measurable edge after a ${
      direction === "rise" ? "sharp rise" : "sharp fall"
    }${volatilityFilter ? ", specifically during high-volatility periods" : ""}.`,
  };

  const missing = [];
  if (!threshold) {
    missing.push({
      field: "entry.thresholdPercent",
      question: "What size move counts as a qualifying fall? (e.g. 1%, 2%, 3%)",
    });
  }
  if (!holdingPeriod) {
    missing.push({
      field: "holdingPeriodDays",
      question: "How many days should the position be held before exiting?",
    });
  }
  if (!exit) {
    missing.push({
      field: "exit",
      question: "Should the exit be time-based only, or do you also want a target / stop-loss?",
    });
  }
  if (instrumentWasGuessed) {
    missing.push({
      field: "instrument",
      question: "I assumed NIFTY since no instrument was named — is that correct?",
    });
  }

  const assumptions = [];
  if (threshold && threshold.assumed) {
    assumptions.push(
      `"Sharp fall" was interpreted as a ${threshold.value}% single-day decline. This is a guess, not something you stated — please confirm or change it.`
    );
  }
  if (instrumentWasGuessed) {
    assumptions.push("Instrument defaulted to NIFTY because none was mentioned in the question.");
  }
  assumptions.push(
    "Cost assumptions (slippage 0.05%, transaction cost 0.03%) are placeholder defaults, not derived from the question."
  );

  return { experiment, missing, assumptions, rawQuestion: question };
}

module.exports = { parseQuestion };
