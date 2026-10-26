# Maintaining RegWatch

This file is the working spec for the twice-weekly update run (Monday and Thursday).
The app is static: **only `feed.json` changes on a normal run.** Don't touch the app code
unless something is broken.

## Each run, in order

1. Read `feed.json`. Note `generated_at`: that's the cut-off for "new".
2. Check every source listed in `sources` for publications **since the last `generated_at`**.
   Use web search and fetch; prefer the regulator's own news, press-release and publications pages.
   Also search for each open file in `trackers` by name, to catch status changes.
3. For each relevant new publication, add an item to `updates` (newest items anywhere in the
   array are fine; the app sorts by date). Use this test for "relevant": it changes, proposes,
   finalises, delays or interprets a rule, standard or supervisory expectation in payments,
   AML/financial crime, sanctions, crypto/stablecoins, tokenisation, open banking/data,
   operational resilience, or prudential treatment of the above. Skip speeches unless they
   announce a policy step; skip enforcement actions unless they set a precedent.
4. Update any affected `trackers`: `stage`, `stage_label`, `points`, `timeline` (mark items
   `done: true`), `next`, `links`, and set `updated` to today.
   Add a new tracker only for a significant multi-step file the reader will want to follow.
5. Update `upcoming`: add newly announced deadlines and remove nothing (the app hides past
   events). Fix any dates that have moved.
6. Set each source's `status` to `checked`, or `unreachable` if it couldn't be read on this run.
7. Set `generated_at` to now (UTC ISO) and `next_update` to the next Monday or Thursday.
8. Run `python3 scripts/validate.py`. Fix every ERROR. Then commit and push to `main`.
9. If more than 160 updates exist, drop the oldest.

## Region rules

- **eu / uk / us** — anything from that jurisdiction's legislators, regulators, supervisors
  or central bank.
- **global** — standard setters and global bodies (FATF, FSB, BIS, Basel Committee, IOSCO,
  CPMI, Wolfsberg) when the output is not specific to one jurisdiction.
- A global body's output about **one** jurisdiction goes in that region: e.g. a FATF mutual
  evaluation report of the US goes in `us`; a FATF grey-listing of an EU member state goes in `eu`.
  Countries outside EU/UK/US are only covered via global list changes.

## Editorial rules

- **Information only. No editorialising.** Describe what the document says, who it applies to
  and when. No "welcome", "landmark", "controversial", "should", "positive for", predictions,
  or opinions. Attributed positions are fine when clearly attributed ("The BIS argues…").
- **Reader:** an experienced AML/financial-crime and payments professional. Skip basics, use
  correct terms (CDD, EDD, RTS, PPSI, CASP), and explain legal mechanics precisely.
- **Plain English, British spelling.** `summary` = one or two sentences. `what_changed` =
  2–5 concrete bullets. No bullet longer than ~45 words.
- **Never quote more than a short phrase** from any source; paraphrase.
- **Every item needs at least one source link**, and should include a primary one whenever
  one is reachable. Label every link:
  - `primary` — the regulator, legislature, court or standard setter itself (incl. Federal
    Register, legislation.gov.uk, EUR-Lex, official central-bank sites).
  - `secondary` — reputable law firms, Big Four, established financial/specialist press
    (FT, Reuters, Bloomberg, Risk.net, Law360, Regulation Tomorrow).
  - `lower` — crypto/trade press, blogs, aggregators. Only use if nothing better exists; the
    app flags these for the reader to verify.
- **Don't guess.** If a date, number or status can't be confirmed, leave it out or mark the
  timeline item `approx: true`. If sources conflict, prefer the primary source and note the
  discrepancy in the bullet.
- Dates are `YYYY-MM-DD` (timeline entries may be `YYYY-MM` or `YYYY` with `approx: true`).
- `added` on a new update = today's date. This drives the app's "NEW" badges.

## Schema reference

See the existing entries in `feed.json`. `stage` is one of:
`proposal`, `consultation`, `rulemaking`, `agreed`, `adopted`, `in_force`, `stalled`.
