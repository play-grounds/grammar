// Slovíčka: a picture game over the czech-grammar/nouns deck, scheduled by SRS.
//
// A lesson is a run of short challenges. The challenge a word gets follows how
// well it is known:
//   new           intro (picture, ten/ta/to + word, English, spoken)
//   learning      recognise: pick the word, pick the picture, or listen and pick
//   review < 3 d  spell it from letter tiles (with č/c-style decoys)
//   review ≥ 3 d  type it (missing accents count as Hard)
// The outcome (right, wrong, slow, accents missing) sets the SRS grade, so the
// player never grades themselves. Bonus rounds, which leave the schedule alone,
// ask for a known word's gender (ten/ta/to) or one of its case forms (bez psa,
// s psem, dva psi); words missed there come back in later bonus rounds.
(() => {
  const KEY = 'slovicka-v1';
  const DATA_VERSION = 6;   // bump with cards.json (and in sw.js), so a new app never runs on an old deck
  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const GENDER = { ma: 'mužský životný', mi: 'mužský neživotný', f: 'ženský', n: 'střední' };
  const GENDER_SHORT = { ma: 'Ma', mi: 'Mi', f: 'F', n: 'N' };
  const GENDER_EN = { ma: 'masculine animate', mi: 'masculine inanimate', f: 'feminine', n: 'neuter' };
  const TOPICS = {
    family: 'Rodina a lidé', home: 'Dům a byt', food: 'Jídlo a pití', meals: 'U stolu',
    shopping: 'Nakupování a peníze', town: 'Město a doprava', travel: 'Cestování a příroda',
    animals: 'Zvířata', time: 'Čas a počasí', body: 'Tělo a zdraví', clothes: 'Oblečení',
    school: 'Škola a práce', leisure: 'Mluvení a volný čas', other: 'Další slova',
  };
  // Real synonyms: accepted for each other when typed, never each other's wrong options.
  const SYNONYMS = [['máma', 'matka', 'maminka'], ['táta', 'otec', 'tatínek'], ['kluk', 'chlapec'], ['holka', 'dívka', 'děvče'],
    ['kafe', 'káva'], ['auto', 'automobil'], ['doktor', 'lékař'], ['doktorka', 'lékařka'], ['taxík', 'taxi'],
    ['záchod', 'toaleta', 'WC']];
  // Singular and plural of one word: never each other's wrong options, but not accepted for each other.
  const RELATED = [['děti', 'dítě'], ['oči', 'oko'], ['uši', 'ucho'], ['lidé', 'člověk'], ['rodiče', 'rodič']];
  // Case frames for the form rounds: [case index, number, frame, label]. 'case' frames also
  // work in the plural for plural-only nouns; 'count' frames need a countable noun.
  const FRAMES = [
    [1, 'case', 'bez …', '2. pád (genitive) after bez'],
    [3, 'case', 'Vidím …', '4. pád (accusative): I see …'],
    [5, 'case', 'o …', '6. pád (locative) after o'],
    [6, 'case', '{s} …', '7. pád (instrumental) after s/se'],
    [0, 'count', '{two} …', '1. pád plural'],
    [1, 'count', 'pět …', '2. pád plural after pět'],
  ];
  const variants = (f) => (f || '').split(' / ').map(x => x.trim()).filter(Boolean);
  // The form rounds that make sense for a card: the answer is not the dictionary form, and
  // there are three real wrong forms to offer.
  function framesFor(card) {
    if (!card.forms || /^(indeclinable|adjective)/.test(card.pattern)) return [];
    const pl = plural(card);
    const all = [...new Set([...card.forms[0], ...card.forms[1]].flatMap(variants))];
    return FRAMES.filter(([i, kind]) => !(pl && kind === 'count')).map(([i, kind, text, label]) => {
      const cells = card.forms[pl || kind === 'count' ? 1 : 0];
      const rights = variants(cells[i]);
      const wrong = all.filter(f => !rights.includes(f));
      if (!rights.length || rights.includes(card.cs) || wrong.length < 3) return null;
      // "se" before s, z, š, ž (se psem, se ženou), otherwise "s"
      const s = /^(s|z|š|ž|ps|vš)/i.test(rights[0]) ? 'se' : 's';
      return { rights, wrong, label: label.replace('s/se', s),
               text: text.replace('{s}', s).replace('{two}', card.g === 'f' || card.g === 'n' ? 'dvě' : 'dva') };
    }).filter(Boolean);
  }
  const LEARN_AHEAD_0 = 5 * SRS.MIN;  // a missed or just-introduced word may come back up to 5 min early
  const LEARN_AHEAD_1 = 1 * SRS.MIN;  // later learning steps keep their real gap
  const INTRO_GAP = 45e3;
  const NEW_PER_LESSON = 5;
  const CATCHUP = 60;
  const XP = { intro: 2, pick: 8, listen: 8, spell: 12, type: 15, form: 8, gender: 5, quest: 15 };
  const GOALS = [[50, 'Casual'], [150, 'Regular'], [300, 'Serious'], [500, 'Intense']];
  const TWINS = { a: 'á', á: 'a', e: 'éě', é: 'eě', ě: 'eé', i: 'íy', í: 'iý', y: 'ýi', ý: 'yí', o: 'ó', ó: 'o',
    u: 'úů', ú: 'uů', ů: 'uú', c: 'č', č: 'c', d: 'ď', ď: 'd', n: 'ň', ň: 'n', r: 'ř', ř: 'r', s: 'š', š: 's',
    t: 'ť', ť: 't', z: 'ž', ž: 'z' };
  const QUESTS = {
    combo10:  { text: 'Get a combo of 10', goal: 10 },
    produce5: { text: 'Spell or type 5 words right', goal: 5 },
    new5:     { text: 'Meet 5 new words', goal: 5 },
    answer30: { text: 'Answer 30 questions', goal: 30 },
    gender3:  { text: 'Get 3 genders right', goal: 3 },
    review15: { text: 'Review 15 words', goal: 15 },
    lessons2: { text: 'Finish 2 lessons', goal: 2 },
    perfect:  { text: 'Finish a lesson with no mistakes', goal: 1 },
    forms2:   { text: 'Get 2 word forms right', goal: 2 },
  };
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rand(a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const bare = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const clean = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const num = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

  let CARDS = [], BY_CS = new Map(), SYN = new Map(), REL = new Map();
  let db = null;
  let saveFailed = false;
  let asleep = false;

  // ---------- storage ----------
  function blank() {
    return {
      cards: {},
      meta: { day: 0, newDone: 0, xp: 0, extraNew: 0, lessons: 0, reviewsDone: 0, quests: [], greeted: false },
      stats: { xp: 0, streak: 0, streakDay: -1, freezes: 0, bestCombo: 0, answers: 0, correct: 0, lostStreak: 0 },
      settings: { levels: ['A1'], perDay: 10, goal: 150, lessonLen: 12, sound: true, speech: true },
    };
  }
  // Accept only well-formed data; anything odd is dropped or clamped, never trusted.
  function sanitize(d) {
    if (!d || typeof d !== 'object' || !d.cards || typeof d.cards !== 'object' || Array.isArray(d.cards)) throw new Error('not a Slovíčka save');
    const b = blank();
    const cards = {};
    for (const [cs, s] of Object.entries(d.cards)) {
      if (!s || typeof s !== 'object') continue;
      const n = ['due', 'ivl', 'ease', 'reps', 'lapses', 'step'].map(k => Number(s[k]));
      if (n.some(x => !Number.isFinite(x))) continue;
      cards[cs] = { due: n[0], ivl: Math.max(0, n[1]), ease: Math.max(1.3, Math.min(5, n[2])), reps: Math.max(0, n[3]),
                    lapses: Math.max(0, n[4]), step: n[5] < 0 ? -1 : Math.min(5, Math.floor(n[5])) };
      if (s.gm) cards[cs].gm = num(s.gm, 0, 99, 0);   // gender misses in bonus rounds
      if (s.fm) cards[cs].fm = num(s.fm, 0, 99, 0);   // form misses
    }
    const m = d.meta || {}, st = d.stats || {}, se = d.settings || {};
    const levels = Array.isArray(se.levels) ? se.levels.filter(l => LEVELS.includes(l)) : [];
    return {
      cards,
      meta: { day: num(m.day, 0, 1e6, 0), newDone: num(m.newDone, 0, 1e4, 0), xp: num(m.xp, 0, 1e7, 0),
              extraNew: num(m.extraNew, 0, 1e4, 0), lessons: num(m.lessons, 0, 1e4, 0), reviewsDone: num(m.reviewsDone, 0, 1e5, 0),
              quests: Array.isArray(m.quests) ? m.quests.filter(q => q && QUESTS[q.id]).map(q => ({ id: q.id, prog: num(q.prog, 0, 1e4, 0), done: !!q.done })) : [],
              greeted: !!m.greeted },
      stats: { xp: num(st.xp, 0, 1e9, 0), streak: num(st.streak, 0, 1e5, 0), streakDay: num(st.streakDay, -1, 1e6, -1),
               freezes: num(st.freezes, 0, 2, 0), bestCombo: num(st.bestCombo, 0, 1e5, 0), answers: num(st.answers, 0, 1e9, 0),
               correct: num(st.correct, 0, 1e9, 0), lostStreak: num(st.lostStreak, 0, 1e5, 0) },
      settings: { levels: levels.length ? levels : ['A1'], perDay: num(se.perDay, 0, 100, b.settings.perDay),
                  goal: num(se.goal, 10, 1000, b.settings.goal), lessonLen: num(se.lessonLen, 5, 50, b.settings.lessonLen),
                  sound: se.sound !== false, speech: se.speech !== false },
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* private mode or bad data: start fresh */ }
    return blank();
  }
  function save() {
    if (asleep) return;   // another tab owns the save now
    try { localStorage.setItem(KEY, JSON.stringify(db)); saveFailed = false; }
    catch (e) {
      if (!saveFailed) banner('Progress can’t be saved in this browser (private mode or storage full). Export it from Settings before you leave.');
      saveFailed = true;
    }
  }
  function banner(text) { $('banner').textContent = text; $('banner').hidden = false; }
  const today = () => SRS.dayOf(Date.now());

  // New day: reset daily counters, deal three quests, settle the streak.
  function rollDay() {
    const day = today();
    if (db.meta.day === day) return;
    db.meta = { day, newDone: 0, xp: 0, extraNew: 0, lessons: 0, reviewsDone: 0, quests: [], greeted: false };
    dealQuests();
    const st = db.stats;
    if (st.streak > 0 && st.streakDay < day - 1) {
      const missed = day - 1 - st.streakDay;
      if (st.freezes >= missed) { st.freezes -= missed; st.streakDay = day - 1; db.meta.froze = missed; }
      else { st.lostStreak = st.streak; st.streak = 0; }
    }
    save();
  }
  // Three quests the player can actually finish today, re-dealt if one becomes impossible.
  function questPossible(id) {
    const end = SRS.startOfDay(today() + 1);
    const c = counts(), reviews = Object.values(db.cards).filter(s => s.step === -1 && s.due < end).length, met = Object.keys(db.cards).length;
    return id === 'new5' ? !c.backlog && c.fresh >= 5
      : id === 'forms2' ? matureCount() >= 5
      : id === 'review15' ? reviews >= 15
      : id === 'produce5' ? reviews >= 8
      : id === 'gender3' ? met >= 8
      : id === 'combo10' || id === 'perfect' ? met >= 4
      : true;
  }
  function dealQuests() {
    const keep = db.meta.quests.filter(q => q.done || q.prog > 0 || questPossible(q.id));
    const pool = shuffle(Object.keys(QUESTS).filter(id => !keep.some(q => q.id === id) && questPossible(id)));
    while (keep.length < 3 && pool.length) keep.push({ id: pool.pop(), prog: 0, done: false });
    db.meta.quests = keep;
  }
  const streakNow = () => db.stats.streakDay >= today() - 1 ? db.stats.streak : 0;
  function creditGoal() {
    if (db.meta.xp < db.settings.goal || db.stats.streakDay === today()) return false;
    db.stats.streak = streakNow() + 1;
    db.stats.streakDay = today();
    db.stats.lostStreak = 0;
    if (db.stats.streak % 7 === 0 && db.stats.freezes < 2) { db.stats.freezes++; db.meta.earnedFreeze = true; }
    return true;
  }

  // ---------- levels ----------
  // Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, …
  const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  const levelStart = (l) => 50 * l * (l - 1);

  // ---------- queue ----------
  const inLevels = (c) => db.settings.levels.includes(c.level);
  const matureCount = () => Object.values(db.cards).filter(s => s.step === -1 && s.ivl >= 7).length;
  function counts(now = Date.now()) {
    rollDay();
    let due = 0, reviewsDue = 0, learning = 0, inAlbum = 0, nextLearn = Infinity;
    for (const [cs, s] of Object.entries(db.cards)) {
      if (!BY_CS.has(cs)) continue;
      inAlbum++;
      if (s.step === -1) { if (s.due <= now) { due++; reviewsDue++; } }
      else { learning++; if (s.due <= now) due++; else nextLearn = Math.min(nextLearn, s.due); }
    }
    const pool = CARDS.filter(c => !db.cards[c.cs] && inLevels(c)).length;
    // with a backlog of reviews, new words wait
    const backlog = reviewsDue > 2 * db.settings.lessonLen;
    // catching up after a break: at most CATCHUP reviews a day, the rest wait for tomorrow
    const capped = backlog && db.meta.reviewsDone >= CATCHUP;
    const fresh = backlog ? 0 : Math.max(0, Math.min(db.settings.perDay + db.meta.extraNew - db.meta.newDone, pool));
    return { due: capped ? due - reviewsDue : due, reviewsDue, learning, inAlbum, fresh, pool, nextLearn, backlog, capped };
  }
  // The next card to study, or null. `avoid` keeps a card from coming twice in a row.
  function pickNext({ avoid = null, mixNew = false, allowNew = true } = {}) {
    const now = Date.now();
    let learnNow = null, learnSoon = null, review = null, reviewScore = -1;
    const unquizzed = [];
    for (const [cs, s] of Object.entries(db.cards)) {
      if (!BY_CS.has(cs)) continue;
      if (s.step >= 0 && s.reps === 0) unquizzed.push(cs);
      if (cs === avoid) continue;
      if (s.step >= 0) {
        const ahead = s.step === 0 ? LEARN_AHEAD_0 : LEARN_AHEAD_1;
        if (s.due <= now) { if (!learnNow || s.due < db.cards[learnNow].due) learnNow = cs; }
        else if (s.due - now <= ahead && (!learnSoon || s.due < db.cards[learnSoon].due)) learnSoon = cs;
      } else if (s.due <= now) {
        // most overdue relative to its interval first
        const score = (now - s.due) / (Math.max(1, s.ivl) * SRS.DAY);
        if (score > reviewScore) { review = cs; reviewScore = score; }
      }
    }
    if (learnNow) return BY_CS.get(learnNow);
    if (review && counts(now).capped) review = null;
    // introduced words are quizzed soon: at most two wait for their first quiz
    if (unquizzed.length >= 2) {
      const q = unquizzed.filter(cs => cs !== avoid).sort((a, b) => db.cards[a].due - db.cards[b].due)[0];
      if (q) return BY_CS.get(q);
    }
    const c = counts(now);
    const fresh = allowNew && c.fresh > 0 ? CARDS.find(x => !db.cards[x.cs] && inLevels(x)) : null;
    if (fresh && (!review || mixNew)) return fresh;
    if (review) return BY_CS.get(review);
    if (learnSoon) return BY_CS.get(learnSoon);
    return null;
  }
  const metCards = () => CARDS.filter(c => db.cards[c.cs]);

  // ---------- speech ----------
  let csVoice = null;
  function findVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      csVoice = vs.find(v => /^cs(-|_|$)/i.test(v.lang)) || null;
    } catch (e) { csVoice = null; }
    renderSpeechSetting();
  }
  if ('speechSynthesis' in window) { findVoice(); speechSynthesis.addEventListener?.('voiceschanged', findVoice); }
  const canSpeak = () => !!csVoice && db && db.settings.speech;
  function say(text) {
    if (!canSpeak()) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = csVoice; u.lang = csVoice.lang; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  const sayBtn = (text) => canSpeak() ? `<button class="say" data-say="${esc(text)}" aria-label="Play the word">🔊</button>` : '';
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-say]'); if (b) { e.stopPropagation(); say(b.dataset.say); } }, true);

  // ---------- sound & haptics ----------
  let actx = null;
  function tone(notes, { type = 'sine', dur = 0.12, gap = 0.07, vol = 0.12 } = {}) {
    if (!db.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      let t = actx.currentTime;
      for (const f of notes) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + dur + 0.02);
        t += gap;
      }
    } catch (e) { /* no audio */ }
  }
  function buzz(ms) { try { if (db.settings.sound && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  const sfx = {
    right: () => { tone([660, 990], { type: 'triangle' }); buzz(15); },
    wrong: () => { tone([220, 165], { type: 'square', dur: 0.16, gap: 0.12, vol: 0.05 }); buzz([60, 40, 60]); },
    almost: () => tone([523, 494], { type: 'triangle' }),
    combo: () => tone([523, 659, 784, 1047], { type: 'triangle', gap: 0.06, dur: 0.1 }),
    tap: () => tone([880], { dur: 0.04, vol: 0.04 }),
    done: () => tone([523, 659, 784, 1047, 1319], { type: 'triangle', gap: 0.09, dur: 0.2 }),
  };

  // ---------- confetti ----------
  function confetti() {
    if (reduced.matches) return;
    const cv = $('confetti'), cx = cv.getContext('2d');
    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const colors = ['#d7141a', '#11457e', '#3a8fd0', '#2e9e4f', '#f9c74f', '#f4a261'];
    const bits = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4,
      s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: pick(colors),
    }));
    let frames = 0;
    cv.hidden = false;
    (function step() {
      cx.clearRect(0, 0, W, H);
      for (const b of bits) {
        b.vy += .35; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        cx.save(); cx.translate(b.x, b.y); cx.rotate(b.r); cx.fillStyle = b.c;
        cx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); cx.restore();
      }
      if (++frames < 150) requestAnimationFrame(step); else { cx.clearRect(0, 0, W, H); cv.hidden = true; }
    })();
  }

  // ---------- screens & history ----------
  // Leaving home pushes one history entry, so the phone's back button returns home (or ends a lesson).
  const SCREENS = ['loading', 'home', 'lesson', 'summary', 'album', 'settings'];
  let pushed = false, ownBack = false;
  function show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    document.body.classList.remove('fb-open');
    if (id !== 'home' && id !== 'loading' && !pushed) {
      const push = () => { try { history.pushState({ s: 1 }, ''); pushed = true; } catch (e) {} };
      if (ownBack) setTimeout(push, 50); else push();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', () => {
    pushed = false;
    if (ownBack) { ownBack = false; return; }
    if (!$('modal').hidden) { closeModal(); try { history.pushState({ s: 1 }, ''); pushed = true; } catch (e) {} return; }
    if (lesson && !$('lesson').hidden) endLesson(); else goHome(true);
  });
  const announce = (t) => { $('sr').textContent = ''; setTimeout(() => { $('sr').textContent = t; }, 30); };
  // Toasts queue up, so a quest reward never hides the goal or streak-freeze message.
  const toasts = [];
  let toastTimer = null;
  function toast(text) { toasts.push(text); if (!toastTimer) nextToast(); }
  function nextToast() {
    const t = $('toast');
    if (!toasts.length) { t.hidden = true; toastTimer = null; return; }
    t.textContent = toasts.shift(); t.hidden = false;
    toastTimer = setTimeout(nextToast, 2400);
  }
  $('toast').addEventListener('click', () => { clearTimeout(toastTimer); nextToast(); });

  const svgOf = (c) => `<svg viewBox="0 0 120 100" aria-hidden="true" focusable="false">${c.svg}</svg>`;
  const plural = (c) => /^plural/.test(c.pattern);
  const article = (c) => plural(c) ? (c.g === 'n' ? 'ta' : c.g === 'ma' ? 'ti' : 'ty') : (c.g === 'f' ? 'ta' : c.g === 'n' ? 'to' : 'ten');
  const gtag = (c) => `<span class="gtag" data-gender="${c.g}">${GENDER_SHORT[c.g]}</span>`;
  const plural2 = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // A rule of thumb for gender from the ending, and whether this word follows it.
  function genderTip(c) {
    const w = c.cs.toLowerCase();
    if (plural(c)) return `${esc(c.cs)} is plural only, so you say <b>${article(c)} ${esc(c.cs)}</b>.`;
    const soft = /[cčřžšjňďťl]$/.test(w);
    const rule = /ost$/.test(w) ? ['f', 'Words ending in -ost are nearly always feminine (ta), but not host and most']
      : /ev$/.test(w) ? ['f', 'Words ending in -ev are usually feminine (ta)']
      : /(á|ová)$/.test(w) ? ['f', 'Nouns ending in -á (like adjectives) are feminine (ta)']
      : /ý$/.test(w) ? ['m', 'Nouns ending in -ý (like adjectives) are masculine (ten)']
      : /a$/.test(w) ? ['f', 'Words ending in -a are usually feminine (ta)']
      : /o$/.test(w) ? ['n', 'Words ending in -o are usually neuter (to)']
      : /í$/.test(w) ? ['n', 'Words ending in -í are usually neuter (to)']
      : /[eě]$/.test(w) ? ['fn', 'Words ending in -e/-ě are usually feminine (ta) or neuter (to)']
      : /um$/.test(w) ? ['n', 'Latin words in -um are neuter (to)']
      : /[uiéy]$/.test(w) ? ['n', 'Borrowed words ending in -u, -i, -é are usually neuter (to)']
      : soft ? ['mf', 'Words ending in a soft consonant can be ten or ta, so learn each one']
      : ['m', 'Words ending in a hard consonant are usually masculine (ten)'];
    const fits = rule[0] === 'm' ? c.g === 'ma' || c.g === 'mi' : rule[0] === 'fn' ? c.g === 'f' || c.g === 'n'
      : rule[0] === 'mf' ? true : rule[0] === c.g;
    const pat = c.pattern.replace(/\s*\(.*\)$/, '');
    return fits ? `${rule[1]}: <b>${article(c)} ${esc(c.cs)}</b>.`
      : `${rule[1]}, but this one is an exception: <b>${article(c)} ${esc(c.cs)}</b> (vzor ${esc(pat)}).`;
  }

  // ---------- home ----------
  function goHome(fromPop) {
    if (pushed && !fromPop) { pushed = false; ownBack = true; try { history.back(); } catch (e) { ownBack = false; } }
    lesson = null; current = null;
    clearTimeout(advanceTimer);
    closeModal();
    const c = counts();
    const st = db.stats, goal = db.settings.goal;
    if (creditGoal()) save();
    const streak = streakNow(), lit = st.streakDay === today();
    $('streak').querySelector('b').textContent = streak;
    $('freezes').textContent = st.freezes ? ' ' + '🧊'.repeat(st.freezes) : '';
    $('streak').classList.toggle('lit', lit);
    $('streak').setAttribute('aria-label', `Streak: ${plural2(streak, 'day', 'days')}${lit ? ', goal met today' : ''}${st.freezes ? `, ${st.freezes} streak freeze${st.freezes > 1 ? 's' : ''}` : ''}`);
    const lv = levelOf(st.xp);
    $('level').querySelector('b').textContent = lv;
    $('level').setAttribute('aria-label', `Level ${lv}`);
    const into = st.xp - levelStart(lv), span = levelStart(lv + 1) - levelStart(lv);
    $('levelbar-fg').style.width = (100 * into / span) + '%';
    $('xp-line').textContent = `Level ${lv} · ${into} / ${span} XP to level ${lv + 1}`;
    $('goal-xp').textContent = db.meta.xp;
    $('goal-of').textContent = `/ ${goal} XP`;
    $('goal').setAttribute('aria-label', `Today's goal: ${db.meta.xp} of ${goal} XP`);
    const frac = Math.min(1, db.meta.xp / goal), C = 2 * Math.PI * 52;
    $('ring-fg').style.strokeDasharray = `${C * frac} ${C}`;
    $('ring-fg').style.opacity = frac > 0 ? 1 : 0;
    $('goal').classList.toggle('met', frac >= 1);
    $('n-due').textContent = c.capped ? c.reviewsDue : c.due;
    $('n-due').nextElementSibling.textContent = c.capped ? 'for tomorrow' : 'to review';
    $('n-new').textContent = c.fresh;
    $('n-album').textContent = c.inAlbum;
    $('album-count').textContent = `${c.inAlbum} / ${CARDS.length}`;
    const next = pickNext();
    $('play').disabled = !next;
    $('play').classList.toggle('done', !next);
    $('play').textContent = !next ? 'All done ✓' : c.backlog ? `Catch up · ${Math.min(db.meta.reviewsDone, CATCHUP)} / ${CATCHUP} today` : !c.due && c.fresh && !Object.keys(db.cards).length ? 'Start learning' : !c.due && c.fresh ? 'Learn new words' : 'Play';
    // day done but words left: the keen player's action becomes the main button
    const offerMore = !next && c.pool > 0 && !c.backlog;
    $('play').hidden = offerMore;
    $('more-new').hidden = !offerMore;
    $('more-new').className = offerMore ? 'primary big' : 'secondary';
    $('practice').hidden = !!next || offerMore || metCards().length < 4;
    $('home-hint').textContent = next ? (c.backlog ? `Catching up after a break: ${CATCHUP} reviews a day, new words wait until the backlog shrinks.` : '') :
      c.capped ? 'Catch-up done for today. The rest wait for tomorrow.' :
      c.nextLearn < Infinity ? `All caught up. The next word is back in ${SRS.label(c.nextLearn - Date.now())}.` :
      c.pool === 0 ? 'You have met every word in your levels. Add a level in Settings.' :
      'All done for today. Come back tomorrow, or take 5 more new words.';
    dealQuests();
    renderQuests();
    show('home');
    greet();
  }
  // once a day: say what happened to the streak while the player was away
  function greet() {
    if (db.meta.greeted) return;
    db.meta.greeted = true;
    const st = db.stats;
    let msg = '';
    if (db.meta.froze) msg = `🧊 A streak freeze saved your ${st.streak}-day streak. Keep it going today!`;
    else if (st.lostStreak >= 3) msg = `Welcome back! Your ${st.lostStreak}-day streak ended. Reach today's goal to start a new one.`;
    else if (st.streak > 0 && st.streakDay === today() - 1) msg = `🔥 ${st.streak}-day streak. Reach today's goal to make it ${st.streak + 1}.`;
    delete db.meta.froze;
    save();
    if (msg) toast(msg);
  }
  function renderQuests() {
    $('quests').innerHTML = db.meta.quests.map(q => {
      const Q = QUESTS[q.id], p = Math.min(q.prog, Q.goal);
      return `<li class="${q.done ? 'done' : ''}"><span>${q.done ? '✅' : '🎯'} ${esc(Q.text)}</span>
        <span class="qbar" role="img" aria-label="${p} of ${Q.goal}"><i style="width:${100 * p / Q.goal}%"></i></span><small>${p}/${Q.goal}</small></li>`;
    }).join('');
  }
  // quest progress: `add` counts up, `max` records a best value
  function quest(id, { add = 0, max = 0 } = {}) {
    for (const q of db.meta.quests) {
      if (q.id !== id || q.done) continue;
      q.prog = max ? Math.max(q.prog, max) : q.prog + add;
      if (q.prog >= QUESTS[id].goal) {
        q.done = true;
        addXp(XP.quest);
        toast(`🎯 Quest complete: ${QUESTS[id].text} (+${XP.quest} XP)`);
        sfx.combo();
      }
    }
  }

  // ---------- lesson ----------
  let lesson = null, current = null, advanceTimer = null, token = 0;

  function startLesson(practice = false) {
    rollDay();
    lesson = { practice, len: db.settings.lessonLen, done: 0, intros: 0, newWords: [], xp: 0, right: 0, answered: 0, combo: 0, best: 0,
               words: new Map(), last: null, xpBefore: db.stats.xp };
    $('progress').setAttribute('aria-valuemax', lesson.len);
    show('lesson');
    nextChallenge();
  }

  function nextChallenge() {
    clearTimeout(advanceTimer);
    token++;
    $('feedback').hidden = true;
    document.body.classList.remove('fb-open');
    if (!lesson) return;
    if (lesson.done + lesson.intros / 2 >= lesson.len) return endLesson();
    let ch = null;
    if (lesson.practice) {
      const pool = metCards().filter(c => c.cs !== lesson.last);
      if (!pool.length) return endLesson(true);
      ch = challengeFor(pick(pool), { practice: true });
    } else {
      // every fifth question is a bonus round, once a few words are known
      if (lesson.done % 5 === 4) ch = bonusRound();
      if (!ch) {
        const card = pickNext({ avoid: lesson.last, mixNew: lesson.done % 4 === 3, allowNew: lesson.intros < NEW_PER_LESSON })
          || pickNext({ avoid: lesson.last, allowNew: true });
        if (card) ch = challengeFor(card);
        else {
          // nothing due: finish the lesson with practice rather than stopping after a question or two
          const pool = metCards().filter(c => c.cs !== lesson.last);
          if (lesson.done >= 5 || pool.length < 4) return endLesson(true);
          lesson.filled = true;
          ch = { ...challengeFor(pick(pool), { practice: true }), bonus: true, filler: true };
        }
      }
    }
    current = { ...ch, answered: false, token, shownAt: Date.now(), t0: Date.now() };
    lesson.last = ch.card.cs;
    renderProgress();
    $('stage').className = 'stage masked';
    render[ch.type](ch);
    // time from when the question is on screen
    requestAnimationFrame(() => { if (current) current.t0 = Date.now(); });
    const h = $('stage').querySelector('.prompt');
    if (h && ch.type !== 'type') h.focus({ preventScroll: true });
  }

  // Gender or case-form round on a known word; words missed before are asked more often.
  function bonusRound() {
    const known = metCards().filter(c => c.cs !== lesson.last && db.cards[c.cs].reps >= 2);
    const formable = known.filter(c => db.cards[c.cs].step === -1 && db.cards[c.cs].ivl >= 3 && framesFor(c).length);
    const useForm = formable.length >= 3 && Math.random() < 0.5;
    const pool = useForm ? formable : known.filter(c => !plural(c));
    if (pool.length < 3) return null;
    const missed = pool.filter(c => (useForm ? db.cards[c.cs].fm : db.cards[c.cs].gm) > 0);
    const card = missed.length && Math.random() < 0.6 ? pick(missed) : pick(pool);
    return { type: useForm ? 'form' : 'gender', card, bonus: true };
  }

  function challengeFor(card, { practice = false } = {}) {
    const s = db.cards[card.cs];
    if (!s && !practice) return { type: 'intro', card };
    const long = card.cs.length > 12;
    // abstract words ('other' topic) have pictures that only make sense next to the English
    const abstract = card.topic === 'other';
    const recog = () => ({ type: abstract ? 'pickWord' : canSpeak() && Math.random() < 0.25 ? 'listen' : Math.random() < 0.5 ? 'pickWord' : 'pickPic', card });
    if (practice) return Math.random() < 0.3 && !long ? { type: 'spell', card } : recog();
    if (s.step >= 0) return recog();
    // long overdue: ease back in with a recognition question
    if (Date.now() - s.due > 2 * s.ivl * SRS.DAY) return recog();
    if (s.ivl < 3) return long ? { type: 'type', card } : { type: 'spell', card };
    return Math.random() < 0.85 || long ? { type: 'type', card } : { type: 'spell', card };
  }

  function renderProgress() {
    const steps = Math.min(lesson.len, lesson.done + lesson.intros / 2);
    $('progress-fg').style.width = (100 * steps / lesson.len) + '%';
    $('progress').setAttribute('aria-valuenow', Math.floor(steps));
    const m = mult();
    $('combo-n').textContent = lesson.combo >= 2 ? `🔥${lesson.combo}${m > 1 ? ' ×' + m : ''}` : '';
    $('combo-fg').style.width = (lesson.combo >= 20 ? 100 : 100 * (lesson.combo % 5) / 5) + '%';
    $('combo').classList.toggle('hot', m > 1);
    $('combo').classList.toggle('on', lesson.combo >= 2);
  }
  const mult = () => lesson ? Math.min(2, 1 + Math.floor(lesson.combo / 5) * 0.25) : 1;

  // Does this card share a meaning with the target? (never offer it as a wrong option)
  // senses keep a "(f)" or "(m)" mark, so učitel and učitelka count as different words
  const senses = (c) => c.en.toLowerCase().replace(/\((?![fm]\))[^)]*\)/g, '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  function sameMeaning(a, b) {
    if (a.cs === b.cs) return true;
    const ga = SYN.get(a.cs);
    if (ga !== undefined && ga === SYN.get(b.cs)) return true;
    const ra = REL.get(a.cs);
    if (ra !== undefined && ra === REL.get(b.cs)) return true;
    const sb = senses(b);
    return senses(a).some(x => sb.includes(x));
  }
  // Three wrong options, from words the player has met where possible, preferring `prefer`.
  function distractors(card, prefer) {
    const ok = (c) => !sameMeaning(card, c);
    const met = (c) => !!db.cards[c.cs];
    const tiers = [
      c => ok(c) && met(c) && prefer(c),
      c => ok(c) && met(c),
      c => ok(c) && inLevels(c) && prefer(c),
      c => ok(c) && inLevels(c),
      ok,
    ];
    const out = [];
    for (const t of tiers) {
      if (out.length === 3) break;
      for (const c of shuffle(CARDS.filter(t))) {
        if (out.length === 3) break;
        if (!out.includes(c) && !out.some(o => sameMeaning(o, c))) out.push(c);
      }
    }
    return out;
  }
  const looksLike = (card) => (c) => c.g === card.g && (c.cs[0].toLowerCase() === card.cs[0].toLowerCase() || Math.abs(c.cs.length - card.cs.length) <= 1);

  const render = {
    intro({ card }) {
      lesson.intros++;
      $('stage').className = 'stage';
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">New word</h2>
        <article class="card revealed" data-gender="${card.g}">
          <div class="pic">${svgOf(card)}</div>
          <div class="cs"><span class="art" lang="cs">${article(card)}</span> <span lang="cs">${esc(card.cs)}</span> ${sayBtn(card.cs)}</div>
          <div class="en">${esc(card.en)}</div>
          <div class="meta">${gtag(card)} ${GENDER[card.g]} · vzor <b lang="cs">${esc(card.pattern)}</b></div>
        </article>
        <button class="primary" id="got-it">Got it <kbd aria-hidden="true">Enter</kbd></button>`;
      $('got-it').addEventListener('click', () => { if (fresh()) return; answer(true); });
      announce(`New word: ${article(card)} ${card.cs}, ${card.en}, ${GENDER_EN[card.g]}`);
      say(card.cs);
    },
    pickWord({ card }) {
      const opts = shuffle([card, ...distractors(card, looksLike(card))]);
      current.options = opts;
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Which word is it?</h2>
        <article class="card"><div class="pic">${svgOf(card)}</div><div class="en">${esc(card.en)}</div></article>
        <div class="options words">${opts.map((c, i) =>
          `<button class="opt" data-i="${i}" lang="cs"><kbd aria-hidden="true">${i + 1}</kbd>${esc(c.cs)}</button>`).join('')}</div>`;
      wireOptions();
      announce(`Which Czech word means ${card.en}?`);
    },
    pickPic({ card }) {
      const opts = shuffle([card, ...distractors(card, c => c.topic === card.topic)]);
      current.options = opts;
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Which picture is <b class="target" lang="cs">${esc(card.cs)}</b>? ${sayBtn(card.cs)}</h2>
        <div class="options pics">${opts.map((c, i) =>
          `<button class="opt pic-opt" data-i="${i}" aria-label="${esc(c.en)}"><kbd aria-hidden="true">${i + 1}</kbd>${svgOf(c)}</button>`).join('')}</div>`;
      wireOptions();
    },
    listen({ card }) {
      const opts = shuffle([card, ...distractors(card, c => c.topic === card.topic)]);
      current.options = opts;
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Listen: which picture?</h2>
        <button class="say big-say" data-say="${esc(card.cs)}" aria-label="Play the word again">🔊</button>
        <div class="options pics">${opts.map((c, i) =>
          `<button class="opt pic-opt" data-i="${i}" aria-label="${esc(c.en)}"><kbd aria-hidden="true">${i + 1}</kbd>${svgOf(c)}</button>`).join('')}</div>`;
      wireOptions();
      setTimeout(() => say(card.cs), 250);
    },
    spell({ card }) {
      const word = [...card.cs];
      const letters = word.filter(ch => ch !== ' ' && ch !== '-');
      const decoys = [];
      for (const ch of shuffle([...new Set(letters.map(l => l.toLowerCase()))])) {
        const t = TWINS[ch];
        if (t && decoys.length < 2) decoys.push(t[rand(t.length)]);
      }
      const abc = 'aeiloukmnprstvdjhz';
      while (decoys.length < 3) decoys.push(abc[rand(abc.length)]);
      // capitals stay capitals, so a decoy capital keeps Čech from giving itself away
      if (letters.some(l => l !== l.toLowerCase())) decoys[0] = decoys[0].toUpperCase();
      const tiles = shuffle([...letters, ...decoys].map((ch, i) => ({ ch, i })));
      Object.assign(current, { word, filled: [], tiles });
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Spell it</h2>
        <article class="card"><div class="pic">${svgOf(card)}</div><div class="en">${esc(card.en)}</div></article>
        <div class="slots" id="slots" lang="cs" aria-live="polite"></div>
        <div class="tileset" id="tileset" lang="cs">${tiles.map(t =>
          `<button class="ltile" data-id="${t.i}">${esc(t.ch)}</button>`).join('')}</div>
        <div class="spell-actions"><button class="secondary small" id="spell-back">⌫ Undo letter</button>
        <button class="secondary small" id="spell-skip">I don't know</button></div>`;
      $('tileset').addEventListener('click', (e) => {
        const b = e.target.closest('.ltile');
        if (b && !b.disabled) placeTile(+b.dataset.id);
      });
      $('slots').addEventListener('click', (e) => {
        const s = e.target.closest('.slot.full');
        if (s) removeTileAt(+s.dataset.k);
      });
      $('spell-back').addEventListener('click', () => removeTileAt(current.filled.length - 1));
      $('spell-skip').addEventListener('click', () => { if (!fresh()) answer(false); });
      drawSlots();
      announce(`Spell the Czech word for ${card.en}, ${letters.length} letters.`);
    },
    type({ card }) {
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Type it in Czech</h2>
        <article class="card"><div class="pic">${svgOf(card)}</div><div class="en">${esc(card.en)}</div></article>
        <form class="typeform" id="typeform" autocomplete="off">
          <input id="typed" lang="cs" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"
            aria-label="Czech word for ${esc(card.en)}" placeholder="${card.cs.length} letters">
          <button class="primary" type="submit">Check</button>
        </form>
        <p class="type-note" id="type-note" aria-live="polite"></p>
        <div class="accents" id="accents" role="group" aria-label="Czech letters">${'áčďéěíňóřšťúůýž'.split('').map(ch => `<button type="button" aria-label="insert ${ch}">${ch}</button>`).join('')}</div>
        <div class="spell-actions"><button class="secondary small" id="hint">💡 First letter</button>
        <button class="secondary small" id="type-skip">I don't know</button></div>`;
      const input = $('typed');
      $('typeform').addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim() && !fresh()) checkTyped(input.value); });
      $('accents').addEventListener('mousedown', (e) => e.preventDefault());   // keep the keyboard up
      $('accents').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || current.answered) return;
        const s = input.selectionStart ?? input.value.length, t = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, s) + b.textContent + input.value.slice(t);
        input.focus(); input.setSelectionRange(s + 1, s + 1);
      });
      $('hint').addEventListener('click', () => {
        if (current.answered) return;
        current.hinted = true;
        if (!input.value.toLowerCase().startsWith(card.cs[0].toLowerCase())) input.value = card.cs[0];
        input.focus();
      });
      $('type-skip').addEventListener('click', () => { if (!fresh()) answer(false); });
      announce(`Type the Czech word for ${card.en}.`);
      setTimeout(() => input.focus({ preventScroll: true }), 50);
    },
    form({ card }) {
      const f = pick(framesFor(card));
      const rights = f.rights;
      if (db.cards[card.cs] && db.cards[card.cs].ivl >= 21 && Math.random() < 0.5) return typedForm(card, f);
      const opts = shuffle([rights[0], ...shuffle(f.wrong).slice(0, 3)]);
      current.forms = { opts, rights, label: f.label };
      current.frame = f.text;
      const frame = esc(f.text).replace('…', '<b class="blank">…</b>');
      const label = f.label;
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Bonus: which form?</h2>
        <article class="card revealed" data-gender="${card.g}"><div class="pic">${svgOf(card)}</div>
          <div class="cs small" lang="cs">${article(card)} ${esc(card.cs)} <span class="en">· ${esc(card.en)}</span></div>
          <div class="frame" lang="cs">${frame}</div>
          <div class="meta">${esc(label)}</div></article>
        <div class="options words">${opts.map((f, k) =>
          `<button class="opt" data-i="${k}" lang="cs"><kbd aria-hidden="true">${k + 1}</kbd>${esc(f)}</button>`).join('')}</div>`;
      $('stage').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
        if (!current || current.answered || fresh()) return;
        const ok = rights.includes(opts[+b.dataset.i]);
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) $('stage').querySelector(`.opt[data-i="${opts.indexOf(rights[0])}"]`).classList.add('right');
        current.pickedForm = opts[+b.dataset.i];
        answer(ok);
      }));
      announce(`Which form of ${card.cs} fits: ${current.frame}`);
    },
    gender({ card }) {
      current.bonus = true;
      $('stage').innerHTML = `
        <h2 class="prompt" tabindex="-1">Bonus: ten, ta or to?</h2>
        <article class="card"><div class="pic">${svgOf(card)}</div><div class="cs" lang="cs">${esc(card.cs)}</div></article>
        <div class="options genders">${['ma', 'mi', 'f', 'n'].map((g, i) =>
          `<button class="opt gopt" data-g="${g}" data-gender="${g}"><kbd aria-hidden="true">${i + 1}</kbd><b>${g === 'f' ? 'ta' : g === 'n' ? 'to' : 'ten'} · ${GENDER_SHORT[g]}</b><small>${GENDER[g]}</small></button>`).join('')}</div>`;
      $('stage').querySelectorAll('.gopt').forEach(b => b.addEventListener('click', () => {
        if (!current || current.answered || fresh()) return;
        const ok = b.dataset.g === card.g;
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) $('stage').querySelector(`.gopt[data-g="${card.g}"]`).classList.add('right');
        answer(ok);
      }));
      announce(`Bonus round. What gender is ${card.cs}?`);
    },
  };
  // Well-known words: type the case form into the frame (bez ___ → psa).
  function typedForm(card, f) {
    current.forms = { rights: f.rights, label: f.label, typed: true };
    current.frame = f.text;
    const [before, after] = f.text.split('…');
    $('stage').innerHTML = `
      <h2 class="prompt" tabindex="-1">Bonus: type the form</h2>
      <article class="card revealed" data-gender="${card.g}"><div class="pic">${svgOf(card)}</div>
        <div class="cs small" lang="cs">${article(card)} ${esc(card.cs)} <span class="en">· ${esc(card.en)}</span></div>
        <div class="meta">${esc(f.label)}</div></article>
      <form class="typeform cloze" id="typeform" autocomplete="off">
        <span class="frame" lang="cs">${esc(before.trim())}</span>
        <input id="typed" lang="cs" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="${esc(card.cs)}: ${esc(f.label)}, ${esc(f.text)}">
        ${after.trim() ? `<span class="frame" lang="cs">${esc(after.trim())}</span>` : ''}
        <button class="primary" type="submit">Check</button>
      </form>
      <div class="accents" id="accents" role="group" aria-label="Czech letters">${'áčďéěíňóřšťúůýž'.split('').map(ch => `<button type="button" aria-label="insert ${ch}">${ch}</button>`).join('')}</div>
      <div class="spell-actions"><button class="secondary small" id="form-skip">I don't know</button></div>`;
    const input = $('typed');
    $('form-skip').addEventListener('click', () => { if (!fresh() && !current.answered) { current.pickedForm = '—'; answer(false); } });
    $('typeform').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim() || fresh() || current.answered) return;
      const v = clean(input.value);
      input.readOnly = true;
      current.pickedForm = input.value.trim();
      if (f.rights.some(r => clean(r) === v)) return answer(true);
      if (f.rights.some(r => bare(r) === bare(v))) { current.almost = true; return answer(true); }
      answer(false);
    });
    $('accents').addEventListener('mousedown', (e) => e.preventDefault());
    $('accents').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || current.answered) return;
      const a = input.selectionStart ?? input.value.length, z = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, a) + b.textContent + input.value.slice(z);
      input.focus(); input.setSelectionRange(a + 1, a + 1);
    });
    announce(`Type the form of ${card.cs}: ${f.text}`);
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  }
  // taps within 250 ms of a question appearing are leftovers from the last one
  const fresh = () => !current || Date.now() - current.shownAt < 250;

  function wireOptions() {
    $('stage').querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
      if (!current || current.answered || fresh()) return;
      const chosen = current.options[+b.dataset.i];
      const ok = chosen.cs === current.card.cs;
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) $('stage').querySelector(`.opt[data-i="${current.options.indexOf(current.card)}"]`).classList.add('right');
      current.picked = chosen;
      answer(ok);
    }));
  }

  // spelling
  function drawSlots() {
    const out = [];
    let k = 0;
    for (const ch of current.word) {
      if (ch === ' ' || ch === '-') { out.push(`<span class="slot gap">${ch === '-' ? '-' : ''}</span>`); continue; }
      const id = current.filled[k];
      const t = id === undefined ? null : current.tiles.find(x => x.i === id);
      out.push(t ? `<button class="slot full" data-k="${k}" aria-label="remove ${esc(t.ch)}">${esc(t.ch)}</button>`
                 : `<span class="slot${k === current.filled.length ? ' next' : ''}"></span>`);
      k++;
    }
    $('slots').innerHTML = out.join('');
    $('tileset').querySelectorAll('.ltile').forEach(b => { b.disabled = current.filled.includes(+b.dataset.id); });
  }
  function placeTile(id) {
    if (current.answered) return;
    const need = current.word.filter(ch => ch !== ' ' && ch !== '-').length;
    if (current.filled.length >= need || current.filled.includes(id)) return;
    current.filled.push(id);
    sfx.tap();
    drawSlots();
    if (current.filled.length === need) {
      const typed = current.filled.map(i => current.tiles.find(t => t.i === i).ch).join('');
      const target = current.word.filter(ch => ch !== ' ' && ch !== '-').join('');
      current.typed = typed;
      const ok = typed === target;
      $('slots').classList.add(ok ? 'right' : 'wrong');
      answer(ok);
    }
  }
  function removeTileAt(k) {
    if (current.answered || k < 0) return;
    current.filled.splice(k, 1);
    drawSlots();
  }
  function typeLetter(key) {
    // keyboard: the first free tile with that letter, exactly, then ignoring case, then ignoring accents
    const free = current.tiles.filter(t => !current.filled.includes(t.i));
    const t = free.find(x => x.ch === key) || free.find(x => x.ch.toLowerCase() === key.toLowerCase())
      || free.find(x => bare(x.ch) === bare(key));
    if (t) placeTile(t.i);
  }

  // typing
  function checkTyped(value) {
    if (current.answered) return;
    const card = current.card, v = clean(value), target = clean(card.cs);
    current.typed = value.trim();
    $('typed').readOnly = true;
    if (v === target) return answer(true);
    if (bare(v) === bare(target)) { current.almost = true; return answer(true); }
    const syn = CARDS.find(c => clean(c.cs) === v && c !== card && SYN.has(c.cs) && SYN.get(c.cs) === SYN.get(card.cs));
    if (syn && current.synonym) { current.hinted = true; return answer(true); }   // twice: fair enough, as Hard
    if (syn) {
      // a real synonym: not wrong, but ask for this card's word once more, with a hint
      current.synonym = syn;
      current.hinted = true;
      current.t0 = Date.now();
      current.typed = '';
      $('typed').readOnly = false;
      $('typed').value = '';
      $('type-note').textContent = `${syn.cs} is right too, but this card is a different word. Try again (hint: ${card.cs[0]}…).`;
      announce($('type-note').textContent);
      $('typed').focus();
      return;
    }
    answer(false);
  }

  // Outcome → SRS grade: 0 again, 1 hard, 2 good, 3 easy.
  function gradeFor(ok) {
    const ms = Date.now() - current.t0, type = current.type;
    if (!ok) return 0;
    if (current.almost || current.hinted) return 1;
    const len = current.card.cs.length;
    const slow = type === 'type' ? 12e3 + 600 * len : type === 'spell' ? 15e3 + 900 * len : 12e3;
    if (ms > slow) return 1;
    if (type === 'type' && ms < 3500 + 350 * len) return 3;
    return 2;
  }

  function answer(ok) {
    if (!current || current.answered) return;
    current.answered = true;
    const card = current.card, type = current.type;
    $('stage').classList.remove('masked');
    let gained = 0;

    if (type === 'intro') {
      if (!lesson.practice) {
        db.cards[card.cs] = { ...SRS.fresh(), isNew: false, due: Date.now() + INTRO_GAP };
        db.meta.newDone++;
        quest('new5', { add: 1 });
        const n = Object.keys(db.cards).length;
        if ([10, 25, 50, 100, 250, 500, 1000, CARDS.length].includes(n)) toast(`📒 ${n} stickers in your album!`);
      }
      gained = XP.intro;
      lesson.words.set(card.cs, 'new');
      lesson.newWords.push(card.cs);
      renderProgress();
      addXp(gained);
      save();
      return nextChallenge();
    }

    lesson.done++;
    lesson.answered++;
    db.stats.answers++;
    quest('answer30', { add: 1 });
    if (ok) {
      if (!current.almost) { lesson.right++; db.stats.correct++; }
      lesson.combo++;
      lesson.best = Math.max(lesson.best, lesson.combo);
      db.stats.bestCombo = Math.max(db.stats.bestCombo, lesson.combo);
      quest('combo10', { max: lesson.combo });
      if (type === 'spell' || type === 'type') quest('produce5', { add: 1 });
      if (type === 'gender') quest('gender3', { add: 1 });
      if (type === 'form') quest('forms2', { add: 1 });
      const half = lesson.practice || current.filler || current.almost;
      gained = Math.round(XP[type === 'pickWord' || type === 'pickPic' ? 'pick' : type] * mult() * (half ? 0.5 : 1));
      if (current.almost) sfx.almost(); else if (lesson.combo % 5 === 0) sfx.combo(); else sfx.right();
    } else {
      lesson.combo = 0;
      sfx.wrong();
    }
    if (!current.bonus && !lesson.practice) {
      const prev = db.cards[card.cs] || SRS.fresh(), recog = ['pickWord', 'pickPic', 'listen'].includes(type);
      if (prev.step === -1) { db.meta.reviewsDone++; quest('review15', { add: 1 }); }
      // a recognition answer on a review word earns no bonus for lateness
      db.cards[card.cs] = SRS.schedule(prev, gradeFor(ok), Date.now(), { noLate: recog && prev.step === -1 });
    } else if (current.bonus && db.cards[card.cs] && (type === 'gender' || type === 'form')) {
      const k = type === 'gender' ? 'gm' : 'fm', st = db.cards[card.cs];
      if (!ok) st[k] = (st[k] || 0) + 1; else if (st[k]) st[k]--;
    }
    if (!ok || current.almost) lesson.words.set(card.cs, 'missed');
    else if (!lesson.words.has(card.cs)) lesson.words.set(card.cs, 'right');
    addXp(gained);
    save();
    renderProgress();
    if (gained) floatXp(gained);

    if (ok && !current.almost) {
      reinforce(card);
      announce(`Correct: ${article(card)} ${card.cs}, ${card.en}. Plus ${gained} XP.`);
      const t = current.token;
      advanceTimer = setTimeout(() => { if (current && current.token === t) nextChallenge(); }, reduced.matches ? 1600 : 1200);
      // a tap anywhere moves on sooner; attached after this click has finished bubbling
      setTimeout(() => {
        const skip = (e) => {
          if (!current || current.token !== t) return;
          if (e.target.closest('[data-say]')) return;
          nextChallenge();
        };
        $('stage').addEventListener('click', skip, { once: true });
      });
    } else {
      showCorrection(card, ok);
    }
  }

  function addXp(n) {
    if (!n) return;
    db.meta.xp += n;
    db.stats.xp += n;
    if (lesson) lesson.xp += n;
    if (creditGoal()) {
      if (lesson) lesson.goalMet = true;
      toast(`🔥 Daily goal reached! ${plural2(db.stats.streak, 'day', 'days')} in a row${db.meta.earnedFreeze ? ' · 🧊 streak freeze earned' : ''}`);
      delete db.meta.earnedFreeze;
      sfx.combo();
    }
  }
  let floats = 0;
  function floatXp(n) {
    const f = document.createElement('div');
    f.className = 'xpfloat';
    f.setAttribute('aria-hidden', 'true');
    f.textContent = `+${n} XP`;
    f.style.top = (64 + 30 * (floats++ % 3)) + 'px';
    $('lesson').appendChild(f);
    setTimeout(() => { f.remove(); floats = Math.max(0, floats - 1); }, 1000);
  }
  // after a right answer, show the word whole: ten/ta/to, Czech in its gender colour, English
  function reinforce(card) {
    const line = `<div class="reveal" data-gender="${card.g}"><span lang="cs">${article(card)}</span> <b lang="cs">${esc(card.cs)}</b> · ${esc(card.en)} ${gtag(card)}</div>`;
    const c = $('stage').querySelector('.card');
    (c || $('stage')).insertAdjacentHTML('beforeend', line);
    say(card.cs);
  }
  function showCorrection(card, ok) {
    let head = 'Correct answer', extra = '', cls = 'wrong';
    if (current.almost) { head = 'Almost! Mind the accents'; cls = 'almost'; extra = `<p>You typed <span lang="cs">${esc(current.typed || current.pickedForm)}</span></p>`; }
    else if (current.typed) extra = `<p>You ${current.type === 'type' ? 'typed' : 'spelled'} <s lang="cs">${esc(current.typed)}</s></p>`;
    if (current.picked) extra = `<p><span lang="cs">${esc(current.picked.cs)}</span> is <i>${esc(current.picked.en)}</i></p>`;
    if (current.type === 'gender') extra = `<p>${genderTip(card)}</p>`;
    if (current.type === 'form' && !current.almost) {
      const f = current.forms;
      head = current.frame.replace('…', f.rights.join(' / '));
      extra = `<p><s lang="cs">${esc(current.pickedForm)}</s> → <b lang="cs">${esc(f.rights.join(' / '))}</b> · ${esc(f.label)} · vzor <span lang="cs">${esc(card.pattern)}</span></p>`;
    } else if (!current.almost && current.type !== 'gender') {
      extra += `<p class="tip">${genderTip(card)}</p>`;
    }
    $('feedback').className = 'feedback ' + cls;
    $('fb-body').innerHTML = `
      <div class="fb-card" data-gender="${card.g}">${svgOf(card)}
        <div><p class="fb-label">${esc(head)}</p><b class="fb-cs" lang="cs">${esc(card.cs)}</b> ${gtag(card)} ${sayBtn(card.cs)}
        <div>${esc(card.en)}</div></div></div>${extra}`;
    $('feedback').hidden = false;
    document.body.classList.add('fb-open');
    announce(`${head}: ${card.cs}, ${card.en}.`);
    say(card.cs);
    $('fb-next').focus({ preventScroll: true });
  }

  function endLesson(ranOut = false) {
    clearTimeout(advanceTimer);
    token++;
    const L = lesson;
    if (!L || (L.answered === 0 && L.intros === 0)) return goHome();
    current = null;
    // lesson-end quests first, so their XP and any goal they reach show in this summary
    if (L.answered >= 5) { db.meta.lessons++; quest('lessons2', { add: 1 }); }
    if (L.answered >= 5 && L.right === L.answered) quest('perfect', { add: 1 });
    lesson = null;
    save();
    const lvBefore = levelOf(L.xpBefore), lvNow = levelOf(db.stats.xp);
    const perfect = L.answered >= 8 && L.right === L.answered;
    const moreNow = !L.practice && !!pickNext();
    const cap = counts().capped;
    $('sum-title').textContent = perfect ? 'Perfektní! Perfect lesson' : cap ? 'Catch-up done for today' : L.practice ? 'Practice done' : (ranOut || L.filled) && !moreNow ? 'Vše hotovo! All caught up' : 'Lekce hotová!';
    countUp($('sum-xp'), L.xp);
    $('sum-acc').textContent = L.answered ? Math.round(100 * L.right / L.answered) + '%' : '–';
    $('sum-combo').textContent = L.best;
    const notes = [];
    if (L.goalMet) notes.push(`🔥 Daily goal reached · ${plural2(db.stats.streak, 'day', 'days')} in a row!`);
    else if (db.meta.xp < db.settings.goal) notes.push(`${db.settings.goal - db.meta.xp} XP to today's goal.`);
    if (lvNow > lvBefore) notes.push(`⭐ Level ${lvNow}!`);
    $('sum-note').innerHTML = notes.map(esc).join('<br>');
    const acc = L.answered ? L.right / L.answered : 1;
    $('sum-cat').textContent = perfect ? 'Výborně!' : acc >= 0.8 ? 'Skvělé!' : acc >= 0.5 ? 'Dobrá práce!' : 'Nevadí, příště to půjde!';
    if (acc < 0.5) notes.push('Tricky words come back sooner, so they will stick. Keep at it!');
    $('sum-note').innerHTML = notes.map(esc).join('<br>');
    const fresh = L.newWords.map(cs => BY_CS.get(cs)).filter(Boolean);
    $('sum-stickers').innerHTML = fresh.length ? `<p class="sum-label">✨ New in your album</p><div class="sum-stickers">${fresh.map((c, i) =>
      `<button class="sticker mini" data-cs="${esc(c.cs)}" data-gender="${c.g}" style="animation-delay:${.15 + i * .12}s" aria-label="${esc(c.cs)}, ${esc(c.en)}">${svgOf(c)}<span lang="cs">${esc(c.cs)}</span></button>`).join('')}</div>` : '';
    const others = [...L.words.entries()].filter(([cs, v]) => v !== 'new' && (v === 'missed' || !L.newWords.includes(cs))).map(([cs, v]) => ({ c: BY_CS.get(cs), v })).filter(x => x.c);
    $('sum-words').innerHTML = others.map(({ c, v }) =>
      `<span class="chip ${v}" data-gender="${c.g}" lang="cs" title="${esc(c.en)}">${esc(c.cs)}${v === 'missed' ? ' ↺' : ''}</span>`).join('');
    $('sum-next').textContent = tomorrowLine();
    $('sum-remind').hidden = streakNow() < 3;
    // nothing due right now: offer practice (no effect on the schedule) instead of a dead end
    const practice = !moreNow && metCards().length >= 4;
    $('sum-again').hidden = !moreNow && !practice;
    $('sum-again').textContent = moreNow ? 'Keep going' : L.practice ? 'More practice' : 'Free practice';
    $('sum-again').dataset.practice = practice ? '1' : '';
    show('summary');
    ($('sum-again').hidden ? $('sum-home') : $('sum-again')).focus({ preventScroll: true });
    announce(`${$('sum-title').textContent} ${L.xp} XP, ${$('sum-acc').textContent} correct.`);
    sfx.done();
    if (L.goalMet || lvNow > lvBefore || perfect) confetti();
  }
  // A daily calendar reminder at this time of day (there is no server to send notifications).
  $('sum-remind').addEventListener('click', () => {
    const d = new Date(Date.now() + SRS.DAY), p2 = (n) => String(n).padStart(2, '0');
    const at = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
    const url = location.href.split('#')[0].split('?')[0];
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Slovicka//EN', 'BEGIN:VEVENT',
      `UID:slovicka-${Date.now()}@slovicka`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${at}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:Slovíčka: 10 minutes of Czech', `URL:${url}`,
      `DESCRIPTION:Keep your streak going: ${url}`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY',
      'DESCRIPTION:Slovíčka time', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'slovicka-reminder.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  function countUp(el, to) {
    if (reduced.matches || to < 5) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 700;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  $('sum-stickers').addEventListener('click', (e) => {
    const b = e.target.closest('.sticker[data-cs]');
    if (!b) return;
    const c = BY_CS.get(b.dataset.cs);
    albumLevel = c.level;
    openAlbum(c.topic);
  });
  function tomorrowLine() {
    const end = SRS.startOfDay(today() + 2);
    let due = 0, close = 0;
    for (const [cs, s] of Object.entries(db.cards)) {
      if (!BY_CS.has(cs)) continue;
      if (s.due < end) due++;
      if (s.step === -1 && s.ivl >= 10 && s.ivl < 21) close++;
    }
    const bits = [];
    if (due) bits.push(counts().backlog && due > CATCHUP ? `Tomorrow: ${CATCHUP} of ${due} words to review` : `Tomorrow: ${plural2(due, 'word', 'words')} to review`);
    if (close) bits.push(`${plural2(close, 'sticker is', 'stickers are')} close to ★★★`);
    return bits.join(' · ');
  }

  // ---------- album ----------
  let albumLevel = null;
  function stars(s) {
    if (!s) return 0;
    if (s.step >= 0) return 1;
    return s.ivl >= 21 ? 3 : 2;
  }
  function openAlbum(topic) {
    albumLevel = albumLevel || db.settings.levels[0] || 'A1';
    $('album-levels').innerHTML = LEVELS.map(l => {
      const all = CARDS.filter(c => c.level === l);
      const got = all.filter(c => db.cards[c.cs]).length;
      return `<button class="chip-btn" aria-pressed="${l === albumLevel}" data-l="${l}">${l} <small>${got}/${all.length}</small></button>`;
    }).join('');
    const got = Object.keys(db.cards).filter(k => BY_CS.has(k)).length;
    $('album-total').textContent = `${got} / ${CARDS.length}`;
    const byTopic = {};
    for (const c of CARDS) if (c.level === albumLevel) (byTopic[c.topic] = byTopic[c.topic] || []).push(c);
    $('album-body').innerHTML = Object.keys(TOPICS).filter(t => byTopic[t]).map(t => {
      const list = byTopic[t];
      const n = list.filter(c => db.cards[c.cs]).length;
      const full = list.every(c => stars(db.cards[c.cs]) === 3);
      return `<section class="atopic" id="t-${t}"><h2>${full ? '🏆 ' : ''}${TOPICS[t]} <small>${n} / ${list.length} collected</small></h2><div class="agrid">${
        list.map(c => {
          const s = db.cards[c.cs], k = stars(s);
          return s
            ? `<button class="sticker" data-cs="${esc(c.cs)}" data-gender="${c.g}" aria-label="${esc(c.cs)}, ${esc(c.en)}, ${k} of 3 stars">${svgOf(c)}<span lang="cs">${esc(c.cs)}</span><i class="stars s${k}" aria-hidden="true">★★★</i></button>`
            : `<div class="sticker locked" aria-hidden="true">${svgOf(c)}<span>?</span></div>`;
        }).join('')}</div></section>`;
    }).join('');
    show('album');
    if (typeof topic === 'string') { const t = $('t-' + topic); if (t) t.scrollIntoView(); }
  }
  $('album-levels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]');
    if (b) { albumLevel = b.dataset.l; openAlbum(); }
  });
  $('album-body').addEventListener('click', (e) => {
    const b = e.target.closest('.sticker[data-cs]');
    if (!b) return;
    const c = BY_CS.get(b.dataset.cs), s = db.cards[c.cs];
    const due = s.step === -1 ? `next review in ${SRS.label(Math.max(0, s.due - Date.now()))}` : 'still learning';
    const k = stars(s);
    openModal(`
      <article class="card revealed" data-gender="${c.g}">
        <div class="pic">${svgOf(c)}</div>
        <h2 class="cs" id="modal-title"><span class="art" lang="cs">${article(c)}</span> <span lang="cs">${esc(c.cs)}</span> ${sayBtn(c.cs)}</h2>
        <div class="en">${esc(c.en)}</div>
        <div class="meta">${gtag(c)} ${GENDER[c.g]} · vzor <b lang="cs">${esc(c.pattern)}</b> · ${c.level}</div>
        ${c.forms ? `<div class="meta" lang="cs">bez <b>${esc(c.forms[0])}</b> · ${c.g === 'f' || c.g === 'n' ? 'dvě' : 'dva'} <b>${esc(c.forms[1])}</b></div>` : ''}
        <div class="meta"><i class="stars s${k}" role="img" aria-label="${k} of 3 stars">★★★</i> · seen ${s.reps}× · ${due}</div>
      </article>`);
  });

  let modalReturn = null;
  function openModal(html) {
    modalReturn = document.activeElement;
    $('modal').innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="icon-btn close" aria-label="Close">✕</button>${html}</div>`;
    $('modal').hidden = false;
    for (const s of SCREENS) $(s).inert = true;
    $('modal').querySelector('.close').focus();
  }
  function closeModal() {
    if ($('modal').hidden) return;
    $('modal').hidden = true;
    $('modal').innerHTML = '';
    for (const s of SCREENS) $(s).inert = false;
    if (modalReturn && modalReturn.isConnected) modalReturn.focus();
  }
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal') || e.target.closest('.close')) closeModal(); });
  $('modal').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...$('modal').querySelectorAll('button')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- settings ----------
  function renderSpeechSetting() {
    if (!db || !$('speech')) return;
    $('speech').checked = db.settings.speech;
    $('speech').disabled = !csVoice;
    $('speech-note').textContent = csVoice ? '' : 'No Czech voice on this device, so words are not read aloud. Installing a Czech text-to-speech voice turns this on.';
  }
  function openSettings() {
    const st = db.settings;
    $('levels').innerHTML = LEVELS.map(l => {
      const n = CARDS.filter(c => c.level === l).length;
      const started = CARDS.filter(c => c.level === l && db.cards[c.cs]).length;
      return `<label><input type="checkbox" value="${l}" ${st.levels.includes(l) ? 'checked' : ''}> ${l} <small>${started}/${n}</small></label>`;
    }).join('');
    $('per-day').value = st.perDay;
    $('goal-set').innerHTML = [...GOALS, ...(GOALS.some(g => g[0] === st.goal) ? [] : [[st.goal, 'Custom']])]
      .map(([v, name]) => `<option value="${v}" ${v === st.goal ? 'selected' : ''}>${name} · ${v} XP</option>`).join('');
    $('lesson-len').value = st.lessonLen;
    $('sound').checked = st.sound;
    renderSpeechSetting();
    show('settings');
  }
  $('levels').addEventListener('change', () => {
    const picked = [...$('levels').querySelectorAll('input:checked')].map(i => i.value);
    db.settings.levels = picked.length ? picked : ['A1'];
    save(); openSettings();
  });
  const bindNum = (id, key, lo, hi) => $(id).addEventListener('change', (e) => {
    db.settings[key] = num(e.target.value === '' ? NaN : e.target.value, lo, hi, db.settings[key]);
    e.target.value = db.settings[key]; save();
  });
  bindNum('per-day', 'perDay', 0, 100);
  bindNum('goal-set', 'goal', 10, 1000);
  bindNum('lesson-len', 'lessonLen', 5, 50);
  $('sound').addEventListener('change', (e) => { db.settings.sound = e.target.checked; save(); if (e.target.checked) sfx.right(); });
  $('speech').addEventListener('change', (e) => { db.settings.speech = e.target.checked; save(); if (e.target.checked) say('ahoj'); });

  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `slovicka-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('import-btn').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const next = sanitize(JSON.parse(await f.text()));
      const known = Object.keys(next.cards).filter(cs => BY_CS.has(cs)).length;
      if (!known) throw new Error('it has no words from this game in it');
      if (!confirm(`Replace this device's progress with ${plural2(known, 'word', 'words')} from the file?`)) return;
      db = next;
      save(); goHome();
    } catch (err) { alert('Could not import this file: ' + err.message); }
  });
  $('reset').addEventListener('click', () => {
    if (!confirm('Delete all progress on this device?')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    db = blank(); goHome();
  });

  // ---------- wiring ----------
  $('play').addEventListener('click', () => startLesson());
  $('practice').addEventListener('click', () => startLesson(true));
  $('more-new').addEventListener('click', () => { db.meta.extraNew += 5; save(); startLesson(); });
  $('quit').addEventListener('click', () => endLesson());
  $('fb-next').addEventListener('click', () => { if (current && current.answered) nextChallenge(); });
  $('sum-again').addEventListener('click', () => startLesson(!!$('sum-again').dataset.practice));
  $('sum-home').addEventListener('click', () => goHome());
  $('open-album').addEventListener('click', () => openAlbum());
  $('album-back').addEventListener('click', () => goHome());
  $('open-settings').addEventListener('click', openSettings);
  $('settings-back').addEventListener('click', () => goHome());

  document.addEventListener('keydown', (e) => {
    if (asleep || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
    if ($('lesson').hidden) {
      if ((!$('album').hidden || !$('settings').hidden || !$('summary').hidden) && e.key === 'Escape') goHome();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); return endLesson(); }
    if (!current) return;
    if (current.answered) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextChallenge(); }
      return;
    }
    if (e.target.matches('input, textarea')) return;   // the type-it box handles its own keys
    if (current.type === 'intro' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!fresh()) answer(true); return; }
    if (current.type === 'spell') {
      if (e.key === 'Backspace') { e.preventDefault(); removeTileAt(current.filled.length - 1); }
      else if (e.key.length === 1 && /\p{L}/u.test(e.key)) { e.preventDefault(); typeLetter(e.key); }
      return;
    }
    if (e.key >= '1' && e.key <= '4') {
      const b = $('stage').querySelectorAll('.opt')[+e.key - 1];
      if (b) { e.preventDefault(); b.click(); }
    }
  });
  // counts change as time passes (day rollover, learning words come due)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && db && !$('home').hidden) goHome(true); });

  // ---------- start ----------
  async function loadCards() {
    const r = await fetch('cards.json?v=' + DATA_VERSION);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const total = +r.headers.get('content-length') || 0;
    let text;
    if (r.body && r.body.getReader) {
      const reader = r.body.getReader(), parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        $('loading-msg').textContent = `Načítám… loading words ${total && total >= got ? Math.round(100 * got / total) + '%' : (got / 1e6).toFixed(1) + ' MB'}`;
      }
      text = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
    } else text = await r.text();
    return JSON.parse(text);
  }
  loadCards()
    .then(rows => {
      CARDS = rows.map(([cs, en, g, pattern, level, topic, svg, forms]) => ({ cs, en, g, pattern, level, topic, svg, forms }));
      BY_CS = new Map(CARDS.map(c => [c.cs, c]));
      SYNONYMS.forEach((group, i) => group.forEach(w => SYN.set(w, i)));
      RELATED.forEach((group, i) => group.forEach(w => REL.set(w, i)));
    })
    .catch(() => { $('loading-msg').textContent = 'Could not load the words. Check your connection and reload.'; throw 0; })
    .then(() => new Promise(r => { claim(); setTimeout(r, channel ? 150 : 0); }))
    .then(() => {
      if (asleep) { db = load(); return; }
      db = load();
      renderSpeechSetting();
      goHome(true);
    })
    .catch((e) => {
      if (e === 0) return;
      $('loading-msg').textContent = 'Something went wrong starting the game. Your saved progress may be damaged.';
      $('loading-reset').hidden = false;
    });
  $('loading-reset').addEventListener('click', () => {
    if (!confirm('Delete saved progress on this device and start again?')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  });

  // One tab at a time: each save writes the whole state, so two live tabs would undo each
  // other. The newest tab takes over; older ones go to sleep until the player wakes them.
  // Newest wins: a tab that hears from a newer one sleeps; one that hears from an older one
  // answers, so the older one sleeps. Ties (tabs restored together) go by id.
  const TAB = Math.random().toString(36).slice(2);
  let since = Date.now();
  let channel = null;
  try { channel = new BroadcastChannel('slovicka'); } catch (e) {}
  function claim() { if (channel) channel.postMessage({ hello: TAB, since }); }
  function sleep() {
    if (asleep) return;
    asleep = true;
    clearTimeout(advanceTimer);
    $('sleep').hidden = false;
    for (const sc of SCREENS) $(sc).inert = true;
    $('wake').focus();
  }
  function wake() {
    // stay asleep (no saves, no input) until the other tab has heard us and the state is reloaded
    lesson = null; current = null;
    clearTimeout(advanceTimer);
    since = Date.now();
    claim();
    $('wake').disabled = true;
    setTimeout(() => {
      db = load();
      asleep = false;
      $('sleep').hidden = true;
      $('wake').disabled = false;
      for (const sc of SCREENS) $(sc).inert = false;
      goHome(true);
    }, 150);
  }
  if (channel) channel.onmessage = (e) => {
    const m = e.data;
    if (!m || !m.hello || m.hello === TAB || asleep) return;
    if (m.since > since || (m.since === since && m.hello > TAB)) sleep(); else claim();
  };
  $('wake').addEventListener('click', wake);
  // without BroadcastChannel, at least pick up what another tab saved while this one sits on home
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && db && !asleep && !lesson && !$('home').hidden) { db = load(); goHome(true); }
  });

  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();
