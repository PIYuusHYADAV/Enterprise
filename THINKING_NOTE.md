# Thinking Note

**Question used as the driving example:** "Does buying NIFTY after a sharp fall work?"

## 1. Interpreting the question

"Sharp fall" has no fixed meaning — it could mean a 1% intraday move to one
trader and a 5% crash to another. I refused to silently pick a number.
Instead, my parser flags any vague magnitude word ("sharp", "big", "steep")
as an **assumption that needs confirmation**, defaulting to 2% only as a
placeholder shown to the user, never hidden.

Before this idea can be tested, I need to know:
- What counts as "a fall" (single-day % move? multi-day drawdown?)
- What instrument, if not stated
- What "work" means — a positive raw return? Beating a buy-and-hold baseline? Risk-adjusted?
- How long the position is held (this changes the answer completely)
- Whether there's a stop-loss/target or a pure time-based exit
- What period of history counts as a fair test

## 2. Assumptions vs. user input vs. system questions

| Category | Example |
|---|---|
| What the user actually said | "NIFTY", "sharp fall" |
| What I assumed | 2% threshold for "sharp", NIFTY default if unnamed, Daily timeframe, cost assumptions (slippage 0.05%, transaction cost 0.03%) |
| What the system should ask | Holding period, exit rule, exact fall threshold, whether a volatility filter is wanted |

I treat "holding period" and "exact threshold" as **non-negotiable** — the
system will not run a test until these are resolved, because the result is
meaningless without them. Cost assumptions are treated as *soft defaults*
that are shown transparently but don't block the test, since they're
industry-standard estimates rather than core to the hypothesis.

## 3. Minimum questions before this becomes a real experiment

1. What size move counts as a qualifying fall?
2. How many days should the position be held?
3. Is there a target/stop-loss, or purely a time-based exit?
4. Is a volatility filter actually wanted, or was it a passing phrase?

I deliberately kept this list short. Asking ten clarifying questions up
front would defeat the purpose of a natural-language interface — the goal
is to ask only what materially changes the result.

## 4. What the experiment looks like

See the DEFINE stage in the app: instrument, timeframe, entry (direction +
threshold), filters, exit, holding period, test period, cost assumptions,
and a plainly stated hypothesis sentence. I intentionally kept "exit" and
"holding period" separate fields, since a real strategy might have both
(e.g. "hold 5 days OR hit a 2% target, whichever comes first").

## 5. What could go wrong

- **Ambiguous definitions**: "fall" could mean close-to-close, intraday
  high-to-low, or gap-down. My prototype only implements close-to-close,
  and says so explicitly rather than pretending it's comprehensive.
- **Look-ahead bias**: entries are priced at the *next* day's close after
  the signal day, not the signal day itself. Still, this is a simple
  precaution, not a guarantee — real systems need much more rigor here
  (e.g. making sure the "high volatility" filter isn't computed using
  data that wouldn't have been available at the time).
- **Data quality**: this prototype uses synthetic data, not real NIFTY
  history. I say this out loud in the UI rather than letting the numbers
  look more authoritative than they are.
- **Transaction costs & slippage**: included as a flat percentage
  deduction, which is a simplification — real slippage varies with
  liquidity and order size.
- **Overfitting**: with enough free parameters (threshold %, holding days,
  filters), it's trivial to find a rule that "worked" on one sample purely
  by chance. The system does not auto-tune parameters to make an edge
  appear — a user could still manually search for the "best" number, which
  is a known trap. A more mature version would penalize/report the number
  of parameter combinations tried.
- **Insufficient evidence**: with a small dataset, a handful of trades can
  look like an edge purely due to noise. I added an explicit small-sample
  warning ("The sample size is too small...") rather than reporting a
  confident-sounding number regardless of trade count.

The system is designed to be honest about these limits rather than to
produce a single, falsely confident number.
