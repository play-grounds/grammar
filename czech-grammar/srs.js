// Spaced repetition scheduler, SM-2 style with learning steps.
//
// A card's state: { due, ivl, ease, reps, lapses, step }
//   step >= 0  learning (or relearning): due is a timestamp, steps are minutes
//   step = -1  review: ivl is in days, due is the start of the due day
// Days roll over at 04:00 local time, so a late-night session counts as today.
const SRS = (() => {
  const MIN = 60e3, DAY = 864e5, ROLLOVER_H = 4;
  const LEARN_STEPS = [1, 10];      // minutes, for new cards
  const RELEARN_STEPS = [10];       // minutes, after a lapse
  const GRAD_IVL = 1, EASY_IVL = 4; // days, on leaving learning
  const START_EASE = 2.5, MIN_EASE = 1.3;

  // Local day number with the 04:00 rollover.
  function dayOf(t) {
    const d = new Date(t - ROLLOVER_H * 3600e3);
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / DAY);
  }
  // Timestamp of 04:00 local on a day number.
  function startOfDay(day) {
    const d = new Date(day * DAY);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), ROLLOVER_H).getTime();
  }

  const fresh = () => ({ due: 0, ivl: 0, ease: START_EASE, reps: 0, lapses: 0, step: 0, isNew: true });

  function fuzz(ivl) {
    if (ivl < 3) return ivl;
    const f = Math.max(1, Math.round(ivl * 0.05));
    return ivl + Math.floor(Math.random() * (2 * f + 1)) - f;
  }

  // grade: 0 again, 1 hard, 2 good, 3 easy. Returns a new state; does not mutate.
  // noLate: give no extra credit for answering late (used when the test was easy, like a
  // multiple choice on a long-overdue word)
  function schedule(s, grade, now, { noFuzz = false, noLate = false } = {}) {
    const c = { ...s, reps: s.reps + 1 };
    delete c.isNew;
    const toReview = (ivl) => {
      ivl = Math.max(1, Math.round(noFuzz ? ivl : fuzz(ivl)));
      return { ...c, step: -1, ivl, due: startOfDay(dayOf(now) + ivl) };
    };

    if (c.step >= 0) {
      const steps = s.lapses > 0 && !s.isNew ? RELEARN_STEPS : LEARN_STEPS;
      const afterLapse = steps === RELEARN_STEPS;
      if (grade === 0) return { ...c, step: 0, due: now + steps[0] * MIN };
      if (grade === 1) {
        // repeat the current step, a bit longer
        const cur = steps[Math.min(c.step, steps.length - 1)];
        const next = steps[c.step + 1] ?? cur * 1.5;
        return { ...c, due: now + Math.round((cur + next) / 2) * MIN };
      }
      if (grade === 3) return toReview(afterLapse ? Math.max(c.ivl, 1) + 1 : EASY_IVL);
      if (c.step + 1 < steps.length) return { ...c, step: c.step + 1, due: now + steps[c.step + 1] * MIN };
      return toReview(afterLapse ? Math.max(c.ivl, 1) : GRAD_IVL);
    }

    // review card; a card answered late gets credit for the extra time it held
    const late = noLate ? 0 : Math.max(0, dayOf(now) - dayOf(c.due));
    if (grade === 0) {
      return { ...c, lapses: c.lapses + 1, ease: Math.max(MIN_EASE, c.ease - 0.2),
               ivl: Math.max(1, Math.round(c.ivl * 0.5)), step: 0, due: now + RELEARN_STEPS[0] * MIN };
    }
    if (grade === 1) {
      c.ease = Math.max(MIN_EASE, c.ease - 0.15);
      return toReview(Math.max(c.ivl + 1, c.ivl * 1.2));
    }
    if (grade === 2) return toReview(Math.max(c.ivl + 1, (c.ivl + late / 2) * c.ease));
    c.ease += 0.15;
    return toReview(Math.max(c.ivl + 2, (c.ivl + late) * c.ease * 1.3));
  }

  function label(ms) {
    const m = Math.round(ms / MIN);
    if (m < 60) return (m < 1 ? '<1' : m) + ' min';
    const h = m / 60;
    if (h < 24) return Math.round(h) + ' h';
    const d = Math.round(ms / DAY);
    if (d < 31) return d + ' d';
    if (d < 365) return Math.round(d / 30) + ' mo';
    return (d / 365).toFixed(1) + ' y';
  }

  return { schedule, fresh, dayOf, startOfDay, label, MIN, DAY };
})();
