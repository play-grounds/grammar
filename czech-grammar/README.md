# Slovíčka

A test PWA: spaced repetition over the 1,576 picture cards (A1–B2) of
[czech-grammar/nouns](https://github.com/czech-grammar/nouns). No build step,
no server, works offline once loaded.

- `index.html`, `app.css`, `app.js` – the app: home (due / new / learned),
  review (Show, then Again / Hard / Good / Easy), settings (levels for new cards,
  new cards per day, picture → Czech or Czech → meaning), export / import / reset.
  Keys: Space shows and then grades Good, 1–4 grade, U undoes, Esc goes home.
- `srs.js` – the scheduler, SM-2 style: learning steps 1 and 10 min, graduate to
  1 day (Easy 4 days), ease 2.5 (min 1.3), a lapse halves the interval and
  relearns at 10 min. Days roll over at 04:00.
- `cards.json` – built by `python3 tools/build-cards.py [path/to/nouns]` from the
  nouns repo's `words*.json`: `[cs, en, gender, pattern, level, topic, svg]` per
  card, A1 first, genders dealt round-robin so new cards mix Ma, Mi, F, N.
- `sw.js`, `manifest.webmanifest`, `icon*` – installable, network-first cache.
  Bump `VERSION` in `sw.js` when the file list changes.

Progress lives in `localStorage` on the device (key `slovicka-v1`); use Export to
move it.
