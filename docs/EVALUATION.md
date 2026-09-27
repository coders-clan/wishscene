# Evaluation and provider selection

## Objective

Prove that complete experiences preserve likeness, scene continuity and plausible motion at an acceptable cost. Do not pick a provider solely from polished examples or advertised specifications.

## Dataset and consent

Recruit at least 10 consenting adults with varied face shapes, skin tones, ages, hairstyles and glasses. Use 8–15 diverse references per person and three destinations including one exact-location reference. Record consent for processing and evaluation, limit reviewer access, set deletion date, and use no minors. Never check real faces into the repo.

## Test matrix

Each person × three places × four scenes. Compare at least two image methods under the same storyboard and prompt budget. For video, evaluate approved still -> simple 4–8 second motion across at least two providers if access permits. Record exact model versions, prompts, reference counts, duration, billable units and output IDs in private evaluation storage.

## Metrics and rubrics

- **Likeness:** subject rates 1–5 and binary "looks like me"; independent raters also score where consent allows. Advisory face embedding similarity is secondary.
- **Continuity:** same outfit, hair, accessories, weather, time, architecture and chronology across four assets.
- **Scene fidelity:** requested action, framing and recognizable place; exact place requests require supplied/licensed anchor.
- **Artifacts:** hands/limbs, signs/text, reflections, duplicated faces, lighting mismatch; count critical vs minor.
- **Video:** identity drift across sampled frames, temporal artifacts, motion plausibility, start-frame match.
- **Economics:** provider spend and total wall time per **approved complete experience**, not per raw generation; retry count.
- **Privacy:** no cross-account access in tests, deletion completion, provider retention terms.

Blind raters to model/provider; randomize output order. Stratify results by user to avoid one easy face dominating. Publish aggregate findings and failure examples with consent; do not expose identifiable examples by default.

## Proposed go/no-go

MVP-A: >=80% of participants approve a complete four-photo experience as looking like themselves, >=80% accept continuity, no critical unhandled privacy failures, and a defined cost ceiling based on intended price. MVP-B adds temporal stability and clip approval thresholds, chosen after pilot measurement. If thresholds fail, improve reference selection and repair workflow before scaling spend.

## Experiment report template

Date; consented cohort; provider/model/version; inputs and prompts; number of candidates/retries; median and p90 time; cost per approved experience; per-user likeness and continuity distribution; observed defects; decision; next experiment. Label hypotheses and measured facts separately.
