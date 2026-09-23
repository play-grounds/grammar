// Slovíčka: spaced repetition over the czech-grammar/nouns picture deck.
(() => {
  const KEY = 'slovicka-v1';
  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const GENDER = { ma: 'Ma · mužský životný', mi: 'Mi · mužský neživotný', f: 'F · ženský', n: 'N · střední' };
  const LEARN_AHEAD = 20 * SRS.MIN;  // with nothing else due, show learning cards up to 20 min early
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  let CARDS = [];                    // [{ cs, en, g, pattern, level, topic, svg }]
  let BY_CS = new Map();
  let db = load();
  let current = null, undoStack = [], shownThisSession = 0, waitTimer = null;

  // ---- storage ----
  function load() {
    const blank = { cards: {}, meta: { day: 0, newDone: 0 }, settings: { levels: ['A1'], perDay: 10, dir: 'pic' } };
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.cards) return { ...blank, ...d, settings: { ...blank.settings, ...d.settings } };
    } catch (e) { /* private mode or bad data: start fresh */ }
    return blank;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage full or blocked */ }
  }
  function rollDay(now) {
    const day = SRS.dayOf(now);
    if (db.meta.day !== day) { db.meta = { day, newDone: 0 }; save(); }
  }

  // ---- queue ----
  function counts(now = Date.now()) {
    rollDay(now);
    let due = 0, learning = 0, learned = 0, nextLearn = Infinity;
    for (const s of Object.values(db.cards)) {
      if (s.step === -1) { learned++; if (s.due <= now) due++; }
      else { learning++; if (s.due <= now) due++; else nextLearn = Math.min(nextLearn, s.due); }
    }
    const pool = CARDS.filter(c => !db.cards[c.cs] && db.settings.levels.includes(c.level)).length;
    const fresh = Math.max(0, Math.min(db.settings.perDay - db.meta.newDone, pool));
    return { due, learning, learned, fresh, pool, nextLearn };
  }

  function pickNext(now = Date.now()) {
    rollDay(now);
    const byCs = (cs) => BY_CS.get(cs);
    let learnNow = null, learnSoon = null, review = null;
    for (const [cs, s] of Object.entries(db.cards)) {
      if (!byCs(cs)) continue;       // card no longer in the deck
      if (s.step >= 0) {
        if (s.due <= now && (!learnNow || s.due < db.cards[learnNow].due)) learnNow = cs;
        else if (s.due > now && (!learnSoon || s.due < db.cards[learnSoon].due)) learnSoon = cs;
      } else if (s.due <= now && (!review || s.due < db.cards[review].due)) review = cs;
    }
    if (learnNow) return byCs(learnNow);
    const c = counts(now);
    const newCard = c.fresh > 0 ? CARDS.find(x => !db.cards[x.cs] && db.settings.levels.includes(x.level)) : null;
    // mix new cards in among reviews, one in four
    if (newCard && (!review || shownThisSession % 4 === 3)) return newCard;
    if (review) return byCs(review);
    if (learnSoon && db.cards[learnSoon].due - now <= LEARN_AHEAD) return byCs(learnSoon);
    return null;
  }

  // ---- screens ----
  function show(id) {
    for (const s of ['home', 'review', 'done', 'loading']) $(s).hidden = s !== id;
  }

  function renderBar() {
    const c = counts();
    $('bar-stats').textContent = `${c.due} due · ${c.fresh} new`;
  }

  function goHome() {
    clearTimeout(waitTimer);
    current = null;
    const c = counts();
    $('n-due').textContent = c.due;
    $('n-new').textContent = c.fresh;
    $('n-learned').textContent = c.learned;
    const next = pickNext();
    $('start').disabled = !next;
    $('home-hint').textContent = next ? '' :
      c.nextLearn < Infinity ? `Next card in ${SRS.label(c.nextLearn - Date.now())}.` :
      c.pool === 0 ? 'Every card in the chosen levels has been started. Add a level in Settings.' :
      'All done for today. Come back tomorrow.';
    renderSettings();
    renderBar();
    show('home');
  }

  function nextCard(forced) {
    clearTimeout(waitTimer);
    current = forced || pickNext();
    renderBar();
    if (!current) return finished();
    const s = db.cards[current.cs];
    const dir = db.settings.dir;
    const card = $('card');
    card.dataset.gender = current.g;
    card.classList.remove('revealed');
    card.classList.toggle('dir-cs', dir === 'cs');
    $('pic').innerHTML = `<svg viewBox="0 0 120 100" role="img" aria-label="${esc(current.en)}">${current.svg}</svg>`;
    $('cs').textContent = current.cs;
    $('en').textContent = current.en;
    $('meta').innerHTML = `${esc(GENDER[current.g])} · vzor <b>${esc(current.pattern)}</b> · ${esc(current.level)}` +
      (!s ? ' · <span class="tag">new</span>' : s.step >= 0 ? ' · <span class="tag">learning</span>' : '');
    $('show-row').hidden = false;
    $('grade-row').hidden = true;
    show('review');
    $('show').focus({ preventScroll: true });
  }

  function reveal() {
    if (!current || $('card').classList.contains('revealed')) return;
    $('card').classList.add('revealed');
    const now = Date.now();
    const s = db.cards[current.cs] || SRS.fresh();
    document.querySelectorAll('#grade-row button').forEach(b => {
      const next = SRS.schedule(s, +b.dataset.grade, now, { noFuzz: true });
      b.querySelector('small').textContent = SRS.label(next.due - now);
    });
    $('show-row').hidden = true;
    $('grade-row').hidden = false;
    document.querySelector('#grade-row .g2').focus({ preventScroll: true });
  }

  function grade(g) {
    if (!current || !$('card').classList.contains('revealed')) return;
    const now = Date.now();
    const prev = db.cards[current.cs];
    undoStack.push({ cs: current.cs, prev, meta: { ...db.meta }, shown: shownThisSession });
    if (undoStack.length > 20) undoStack.shift();
    if (!prev) db.meta.newDone++;
    db.cards[current.cs] = SRS.schedule(prev || SRS.fresh(), g, now);
    shownThisSession++;
    save();
    $('undo').disabled = false;
    nextCard();
  }

  function undo() {
    const u = undoStack.pop();
    if (!u) return;
    if (u.prev) db.cards[u.cs] = u.prev; else delete db.cards[u.cs];
    db.meta = u.meta;
    shownThisSession = u.shown;
    save();
    $('undo').disabled = !undoStack.length;
    nextCard(BY_CS.get(u.cs));
  }

  function finished() {
    const c = counts();
    if (c.nextLearn < Infinity) {
      const wait = c.nextLearn - Date.now();
      $('done-msg').textContent = `Nice. ${c.learning} card${c.learning === 1 ? '' : 's'} still learning, next in ${SRS.label(wait)}.`;
      waitTimer = setTimeout(() => { if (!$('done').hidden) nextCard(); }, Math.max(1000, wait - LEARN_AHEAD));
    } else {
      $('done-msg').textContent = 'Hotovo! All done for today.';
    }
    show('done');
  }

  // ---- settings ----
  function renderSettings() {
    const st = db.settings;
    $('levels').innerHTML = LEVELS.map(l => {
      const n = CARDS.filter(c => c.level === l).length;
      const started = CARDS.filter(c => c.level === l && db.cards[c.cs]).length;
      return `<label><input type="checkbox" value="${l}" ${st.levels.includes(l) ? 'checked' : ''}> ${l} <small>${started}/${n}</small></label>`;
    }).join('');
    $('per-day').value = st.perDay;
    document.querySelectorAll('input[name=dir]').forEach(r => { r.checked = r.value === st.dir; });
  }
  $('levels').addEventListener('change', () => {
    db.settings.levels = [...$('levels').querySelectorAll('input:checked')].map(i => i.value);
    save(); goHome();
  });
  $('per-day').addEventListener('change', (e) => {
    db.settings.perDay = Math.max(0, Math.min(100, Math.round(+e.target.value || 0)));
    save(); goHome();
  });
  document.querySelectorAll('input[name=dir]').forEach(r => r.addEventListener('change', () => {
    db.settings.dir = r.value; save();
  }));

  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `slovicka-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || typeof d.cards !== 'object') throw new Error('not a Slovíčka export');
      if (!confirm(`Replace this device's progress with ${Object.keys(d.cards).length} cards from the file?`)) return;
      db = { ...load(), ...d, settings: { ...db.settings, ...d.settings } };
      save(); goHome();
    } catch (err) { alert('Could not import: ' + err.message); }
  });
  $('reset').addEventListener('click', () => {
    if (!confirm('Delete all progress on this device?')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    db = load(); undoStack = []; $('undo').disabled = true; goHome();
  });

  // ---- wiring ----
  $('start').addEventListener('click', () => { shownThisSession = 0; nextCard(); });
  $('show').addEventListener('click', reveal);
  $('card').addEventListener('click', reveal);
  document.querySelectorAll('#grade-row button').forEach(b => b.addEventListener('click', () => grade(+b.dataset.grade)));
  $('undo').addEventListener('click', undo);
  $('home-btn').addEventListener('click', goHome);
  $('done-home').addEventListener('click', goHome);
  document.addEventListener('keydown', (e) => {
    if ($('review').hidden || e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const revealed = $('card').classList.contains('revealed');
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed && e.key >= '1' && e.key <= '4') { e.preventDefault(); grade(+e.key - 1); }
    else if (revealed && e.key === ' ') { e.preventDefault(); grade(2); }
    else if (e.key === 'u' || e.key === 'z') undo();
    else if (e.key === 'Escape') goHome();
  });
  // counts change as time passes (day rollover, learning cards come due)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('home').hidden) goHome(); });

  fetch('cards.json')
    .then(r => r.json())
    .then(rows => {
      CARDS = rows.map(([cs, en, g, pattern, level, topic, svg]) => ({ cs, en, g, pattern, level, topic, svg }));
      BY_CS = new Map(CARDS.map(c => [c.cs, c]));
      goHome();
    })
    .catch(() => { $('loading').textContent = 'Could not load the cards. Check your connection and reload.'; });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();
