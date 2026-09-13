# AI Usage Note

**Tools used:**
1. **Claude (Anthropic)** — used as a coding assistant throughout the build.
2. **Google Gemini (`gemini-2.0-flash`)** — used inside the running
   application itself, as the actual AI implementation for the "understand
   the question" step (`backend/lib/llmParser.js`).

**What Claude was used for:**
- Scaffolding the Express server and the four API routes (`/parse`,
  `/clarify`, `/test`) based on a structure I decided on first.
- Writing the rule-based fallback extraction logic in `parser.js` — I gave
  the general design ("detect instrument, threshold, holding period,
  direction, volatility filter, exit; flag anything vague as an
  assumption") and let it draft the implementation, which I then reviewed
  line-by-line.
- Writing the Gemini integration layer (`llmParser.js`), including the
  extraction prompt and the fallback logic in `server.js`.
- Generating the synthetic price-data generator in `backtest.js` (seeded
  PRNG + random walk with occasional shocks), since reproducible sample
  data isn't the interesting part of this assignment.
- Frontend HTML/CSS/JS wiring for the four-step UI flow.
- Drafting this documentation set, which I then edited for accuracy.

**What Gemini is used for, live in the app:**
- Reading the user's raw question and returning structured JSON
  (instrument, entry condition, threshold, filters, exit, holding period,
  hypothesis).
- Explicitly deciding when it has inferred a value versus been told one —
  the prompt requires it to set `thresholdAssumed: true` and explain its
  reasoning whenever it infers a number from vague language like "sharp
  fall," rather than silently presenting a guess as fact.
- Never inventing a holding period — the prompt explicitly forbids this,
  since that field is treated as a hard requirement before a test can run.

**What I decided myself (not the AI):**
- Choosing Option 2 over Option 1, and choosing to treat "missing
  information" as a hard blocker for holding period / entry threshold, but
  a soft default for cost assumptions — this was a judgment call about
  which fields materially change the answer.
- The decision to use a rule-based parser instead of calling an LLM API:
  the sandbox this was built in has no outbound access to LLM providers,
  so I chose to be transparent about that rather than fake an "AI" layer
  or hardcode canned outputs. The code is structured so `parseQuestion()`
  is the single function you'd replace with an LLM call — nothing else in
  the pipeline needs to change.
- The backtest's honesty features (small-sample warning, "what the data
  shows" vs. "what we conclude" separation, listing caveats explicitly)
  came from thinking about how this system could mislead a non-technical
  user, not from an AI suggestion.
- Rejecting an early AI-suggested version of the backtest that computed
  entries on the *same day* as the signal (a look-ahead bias bug) — I
  caught this while reviewing and fixed it to enter on the next day's
  close instead.

**What I'm most proud of:**
The separation between "what the user said," "what the system assumed,"
and "what the system is still asking" — this maps directly to the
assignment's core ask (don't blindly assume) and it's enforced in the code
(the `/clarify` endpoint literally re-checks and refuses to let a test run
until required fields are resolved), not just described in the UI copy.
