
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "nifty_sample.csv");


function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSampleData() {
  const rand = mulberry32(42);
  const days = 750; // ~3 trading years
  let price = 22000;
  const rows = [["date", "close"]];
  const start = new Date("2023-01-02");

  for (let i = 0; i < days; i++) {
    
    let dailyReturn = (rand() - 0.485) * 0.012; 
    if (rand() < 0.04) {
    
      dailyReturn -= rand() * 0.03;
    }
    price = price * (1 + dailyReturn);

    const d = new Date(start);
    d.setDate(d.getDate() + i);
    rows.push([d.toISOString().slice(0, 10), price.toFixed(2)]);
  }

  const csv = rows.map((r) => r.join(",")).join("\n");
  fs.writeFileSync(DATA_PATH, csv);
}

function loadSampleData() {
  if (!fs.existsSync(DATA_PATH)) generateSampleData();
  const lines = fs.readFileSync(DATA_PATH, "utf-8").trim().split("\n").slice(1);
  return lines.map((line) => {
    const [date, close] = line.split(",");
    return { date, close: parseFloat(close) };
  });
}


function runBacktest(experiment) {
  const data = loadSampleData();
  const threshold = experiment.entry.thresholdPercent ?? 2.0;
  const holdingDays = experiment.holdingPeriodDays ?? 5;
  const useVolFilter = (experiment.filters || []).includes("high_volatility");
  const costPercent =
    (experiment.costAssumptions?.slippagePercent || 0) +
    (experiment.costAssumptions?.transactionCostPercent || 0);


  const returns = [];
  for (let i = 1; i < data.length; i++) {
    returns.push((data[i].close - data[i - 1].close) / data[i - 1].close);
  }

  const vol = new Array(returns.length).fill(0);
  for (let i = 10; i < returns.length; i++) {
    const window = returns.slice(i - 10, i);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    vol[i] = Math.sqrt(variance);
  }
  const sortedVol = [...vol].sort((a, b) => a - b);
  const medianVol = sortedVol[Math.floor(sortedVol.length / 2)];

  const trades = [];
  for (let i = 0; i < returns.length; i++) {
    const dayIndex = i + 1; // index into `data`
    const fellEnough = experiment.entry.direction === "rise"
      ? returns[i] * 100 >= threshold
      : returns[i] * 100 <= -threshold;

    if (!fellEnough) continue;
    if (useVolFilter && vol[i] < medianVol) continue;

    const entryIndex = dayIndex + 1; // buy next day's close
    const exitIndex = entryIndex + holdingDays;
    if (exitIndex >= data.length) continue;

    const entryPrice = data[entryIndex].close;
    const exitPrice = data[exitIndex].close;
    const grossReturn = ((exitPrice - entryPrice) / entryPrice) * 100;
    const netReturn = grossReturn - costPercent;

    trades.push({
      entryDate: data[entryIndex].date,
      exitDate: data[exitIndex].date,
      grossReturnPercent: parseFloat(grossReturn.toFixed(3)),
      netReturnPercent: parseFloat(netReturn.toFixed(3)),
    });
  }

  const winCount = trades.filter((t) => t.netReturnPercent > 0).length;
  const avgReturn = trades.length
    ? trades.reduce((a, t) => a + t.netReturnPercent, 0) / trades.length
    : 0;


  const baselineReturns = [];
  for (let i = 0; i + holdingDays < data.length; i++) {
    baselineReturns.push(((data[i + holdingDays].close - data[i].close) / data[i].close) * 100);
  }
  const baselineAvg =
    baselineReturns.reduce((a, b) => a + b, 0) / (baselineReturns.length || 1);

  return {
    tradeCount: trades.length,
    winRate: trades.length ? parseFloat(((winCount / trades.length) * 100).toFixed(1)) : 0,
    avgNetReturnPercent: parseFloat(avgReturn.toFixed(3)),
    baselineAvgReturnPercent: parseFloat(baselineAvg.toFixed(3)),
    edgeVsBaselinePercent: parseFloat((avgReturn - baselineAvg).toFixed(3)),
    sampleTrades: trades.slice(0, 8),
    dataPoints: data.length,
  };
}

module.exports = { runBacktest };
