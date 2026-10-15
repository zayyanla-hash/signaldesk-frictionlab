# Two-minute FrictionLab demo

**0:00–0:15 — Frame the problem**

“I built FrictionLab to make a funnel decision traceable. It’s a work sample using synthetic data, not a story about customer traction. The flow is one analysis: import, validate, inspect, propose, export.”

**0:15–0:40 — Import and defend the denominator**

Open **Import funnel data → Load eight-user event fixture**. Point to the ordered-user grain, seven-day window, signup interval and cutoff. Click **Validate dataset**, then **Replace active dataset**.

“Nothing is silently appended to the sample. Seven users have a full window; the eighth is still immature. Repeated connections do not create extra users.”

**0:40–1:00 — Inspect the observation**

Show **3 / 7 = 42.9%**, the wide interval, and the small-sample warning. Select **Connected data**, then open its source paths.

“Five of seven reached connection. That is an observed gap, not proof of why anyone left. I can trace the denominator and the missing qualifying event. With this sample, the priority is fragile.”

**1:00–1:20 — Show a more legible synthetic example**

Load the **synthetic aggregate** example. Tick the population assertion, validate, replace. Point to **1,000 → 550 → 400**, **40%** end-to-end and **450** lost before connection. Select **Mobile** briefly, showing **100 / 400 = 25%**, then return to all supplied segments.

“These groups come from the input. I don’t infer a segment or pool different windows. Aggregate nesting and disjointness are declared assumptions; counts alone can’t verify them.”

**1:20–1:45 — Make the proposed test measurable**

Click **Draft a test for this stage**. Show the untested hypothesis, random allocation, exact primary numerator/denominator, error-rate guardrail, fixed decision rule and instrumentation.

“This is a proposed test, not an AI explanation or a launched experiment. The primary window starts at signup. I would verify the suspected guidance problem, establish a fresh baseline and size the test before running it. The upside slider is explicitly hypothetical.”

**1:45–2:00 — Deliver a decision**

Click **Export decision brief** and open the downloaded HTML or sample PDF.

“The brief carries the source description, formulas, observed issue, experiment and limits. My contribution is the product framing, analytical contract, evidence boundaries and experiment workflow, built with AI coding assistance. Every displayed metric comes from deterministic calculations.”

**Optional follow-up:** Load the invalid fixture to show duplicate/timestamp errors and an unchanged active analysis. Or import `independent-events.csv`: a 400% activity ratio is allowed, but no user-conversion or friction claim is made.
