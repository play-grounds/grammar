# Slovíčka

A picture game for Czech nouns with spaced repetition: the 1,576 cards (A1–B2)
of [czech-grammar/nouns](https://github.com/czech-grammar/nouns). Static PWA, no
build step, no server, works offline once loaded.

## How it plays

A lesson is a run of short challenges. The challenge a word gets follows how
well it is known, and the answer (right, wrong, slow, accents missing) sets the
SRS grade, so the player never grades themselves.

| Word is… | Challenge |
|---|---|
| new | intro: picture, *ten/ta/to* + word, English, gender and pattern, spoken |
| learning | recognise: pick the word, pick the picture, or listen and pick |
| review, < 3 days | spell it from letter tiles (with č/c-style decoys) |
| review, ≥ 3 days | type it (accent keys; missing accents = Hard, a synonym gets a retry) |
| long overdue | a recognition question first, with no bonus for lateness |

Every fifth question is an ungraded bonus round on a known word: its gender, or
a case form in a frame (*bez psa, Vidím psa, o psovi, se psem, dva psi, pět psů*),
multiple choice or typed for words at 21+ days. Missed genders and forms come
back more often.

Around it: XP with a combo multiplier, a daily goal (Casual 50 / Regular 150 /
Serious 300 / Intense 500), a streak with freezes (one per 7-day streak, up to
two), three daily quests, levels, a sticker album by level and topic (★ learning,
★★ known, ★★★ 21+ days; 🏆 for a full topic), a summary with the cat, new stickers
and tomorrow's preview, and an .ics daily reminder once the streak reaches 3.

New words come in by corpus frequency (SYN2015), concrete words first, at most
5 per lesson before they are quizzed. After a break, catch-up caps reviews at 60
a day and new words wait.

## Files

- `index.html`, `app.css`, `app.js` – the game. `srs.js` – the scheduler (SM-2
  style: learning steps 1 and 10 min, graduate to 1 day, Easy 4 days, ease 2.5,
  a lapse halves the interval and relearns at 10 min; days roll over at 04:00).
- `cards.json` – built by `python3 tools/build-cards.py [path/to/nouns]` from the
  nouns repo: `[cs, en, gender, pattern, level, topic, svg, forms]` per card, where
  picture labels that spell the answer carry `class="ans"` (hidden while asking)
  and `forms` is the checked declension from `declension.json` (Wiktionary,
  CC BY-SA), cleaned of notes and rare variants.
- `sw.js`, `manifest.webmanifest`, `icon*` – installable; network first with a
  4 s fallback to the cache. When `cards.json` changes, bump `DATA_VERSION` in
  `app.js` and `DATA` and `VERSION` in `sw.js` together.

Progress lives in `localStorage` (key `slovicka-v1`), validated on load and
import; Export/Import in Settings move it between devices. Only one tab plays
at a time, so two tabs cannot overwrite each other.

## Known gaps

- Audio uses the device's Czech text-to-speech voice when there is one; with
  none, words are silent and the listen round is skipped. Recorded clips would fix it.
- Upstream data to fix in the nouns repo: *kafe* is marked indeclinable, the
  irregular plurals of *oko/ucho* have no note, colloquial words (*kluk, holka,
  táta*) carry no register label.
- No example sentences yet.
