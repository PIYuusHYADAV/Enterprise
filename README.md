# AI Trading Research Assistant — Mini Prototype

A small prototype demonstrating the pipeline:
**Question → Clarify → Structured Experiment → Test → Learn**

Built for Option 2 of the assignment.

## Architecture

```
project/
├── backend/
│   ├── server.js        # Express API: /api/parse, /api/clarify, /api/test
│   ├── lib/
│   │   ├── parser.js    # question -> structured experiment + missing fields
│   │   └── backtest.js  # runs the experiment against sample data
│   └── data/            # synthetic sample dataset (generated on first run)
├── public/               # plain HTML/CSS/JS frontend (no framework)
├── Dockerfile
├── docker-compose.yml
├── THINKING_NOTE.md
├── AI_USAGE_NOTE.md
└── README.md
```

**Flow:**
1. User types a question → `POST /api/parse` extracts instrument, entry
   condition, filters, exit, holding period, and flags whatever is missing
   or assumed.
2. If fields are missing, the UI asks for them → `POST /api/clarify`
   merges the answers back into the experiment and re-checks what's still
   required.
3. Once complete, the UI renders the structured experiment (`DEFINE`).
4. `POST /api/test` runs a simple backtest against a synthetic sample
   dataset and returns results plus an explicit "what the data shows" vs.
   "what we conclude" breakdown (`LEARN`).

## Technologies used

- **Backend:** Node.js + Express (kept deliberately small — no ORM/DB
  needed for a stateless single-question flow).
- **Frontend:** Plain HTML/CSS/JS. No React/build step, because the UI is
  four simple screens and a framework would add ceremony without adding
  clarity for a 3–4 hour prototype.
- **"AI" layer:** rule-based/regex extraction (see note below) — the
  pipeline is structured so this is a drop-in replacement for a real LLM
  call.
- **Docker:** single-container setup (Node backend serves the static
  frontend too), via `Dockerfile` + `docker-compose.yml`.

## AI implementation: Gemini + rule-based fallback

`/api/parse` calls **Google Gemini** (`gemini-2.0-flash`) to extract the
structured experiment from the question. The prompt asks Gemini to return
strict JSON, and explicitly instructs it to never invent a holding period,
and to flag any inferred numeric threshold (e.g. from "sharp fall") as an
assumption rather than a fact.

If `GEMINI_API_KEY` is not set, or the Gemini call fails for any reason
(network issue, rate limit, bad key), the server automatically falls back
to a rule-based/regex parser (`backend/lib/parser.js`) so the app never
breaks. The UI shows a small badge ("Parsed by Gemini" / "Parsed by
rule-based fallback") so it's always clear which path answered.

### Setting up your Gemini key
1. Get a key from https://aistudio.google.com/app/apikey
2. Copy `.env.example` to `.env` and paste your key in:
   ```
   GEMINI_API_KEY=your_actual_key_here
   ```
3. With Docker: `docker compose up --build` (docker-compose reads `.env`
   automatically).
   Without Docker: `export GEMINI_API_KEY=your_actual_key_here` before
   running `npm start`, or use a tool like `dotenv`.

**Never commit your real key.** `.env` is already in `.gitignore`.

## Key decisions

- **Hard-block vs. soft-default missing fields.** Entry threshold and
  holding period block the test entirely — the result is meaningless
  without them. Cost assumptions (slippage/transaction cost) are shown
  as defaults but don't block, since they're standard estimates rather
  than user intent.
- **No look-ahead bias in the toy backtest.** Entries are priced at the
  *next* day's close after the signal day, not the signal day's own close.
- **Explicit small-sample warning.** If fewer than 10 matching trades are
  found in the sample data, the system reports the result as inconclusive
  rather than stating a confident-sounding edge.
- **"What the data shows" vs. "what we conclude" are separate fields**,
  per the assignment's explicit ask to distinguish observation from
  interpretation.

## How to run

### With Docker (recommended)
```bash
docker compose up --build
```
Then open **http://localhost:4000**

### Without Docker
```bash
npm install
npm start
```
Then open **http://localhost:4000**

## What I would improve with more time

- Add JSON schema validation on the Gemini response (right now it trusts
  `responseMimeType: "application/json"` plus a defensive parse).
- Support compound entry/exit rules (e.g. "5 days OR 2% target, whichever
  first") — currently exit and holding period are handled somewhat
  independently.
- Use real historical NIFTY data (e.g. via a public market-data API)
  instead of synthetic data, with proper survivorship/adjustment handling.
- Add sensitivity analysis (vary threshold/holding period slightly and
  show how stable the "edge" is) to directly address overfitting risk.
- Persist past experiments (a "Remember what it learned" store) so
  repeated or related questions can build on prior findings.
- Add automated tests for `parser.js` and `backtest.js`.
