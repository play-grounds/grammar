#!/usr/bin/env python3
"""Build cards.json from the nouns deck (czech-grammar/nouns, words*.json).

Usage: python3 tools/build-cards.py [path/to/nouns]   (default ~/ideas/czech)
Each card is a compact array: [cs, en, gender, pattern, level, topic, svg, forms].

- Levels come in order, A1 first. Within a level, words are sorted by corpus
  frequency (SYN2015 lemma rank from the nouns repo's tools/b1), so a learner
  meets voda, dům, ruka before poschodí; abstract topics are weighted back.
  Unranked words go after the ranked ones of their level. Plural-only words use the rank of their singular (oči → oko).
- Picture labels that spell the answer (ŠKOLA on the school) get class "ans",
  so the game can hide them while the word is being asked for.
- forms: the declension, [sg[7], pl[7]] in case order, from the nouns repo's
  declension.json (Wiktionary, CC BY-SA), or null; used by the form rounds.
"""
import json, os, re, sys, unicodedata

src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/ideas/czech')
out = os.path.join(os.path.dirname(__file__), '..', 'cards.json')

rank = {}
with open(os.path.join(src, 'tools', 'b1', 'syn2015-lemmas.txt'), encoding='utf-8') as fh:
    for i, line in enumerate(fh):
        w = line.split()[0] if line.split() else ''
        if w and w not in rank:
            rank[w] = i + 1

decl = json.load(open(os.path.join(src, 'declension.json'), encoding='utf-8'))


def norm(s):
    return ''.join(ch for ch in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(ch) != 'Mn')


def mask_answer(cs, svg):
    w = norm(cs).replace(' ', '').replace('-', '')
    stem = w[:max(3, min(len(w) - 1, 5))]

    def tag(m):
        t = norm(re.sub('<[^>]+>', '', m.group(2))).replace(' ', '')
        if len(t) >= 3 and (stem in t or t in w):
            return m.group(1).replace('<text', '<text class="ans"', 1) + m.group(2) + '</text>'
        return m.group(0)
    return re.sub(r'(<text[^>]*>)(.*?)</text>', tag, svg)


def rank_of(w):
    if w['cs'] in rank:
        return rank[w['cs']]
    m = re.search(r'\(([^)]+)\)', w['pattern'])   # plural only (oko)
    if w['pattern'].startswith('plural') and m and m.group(1) in rank:
        return rank[m.group(1)]
    return None


# Picturable words first: abstract topics and plural-only twins of a singular
# (děti after dítě, oči after oko) are pushed back, so the first lessons are
# concrete and near-synonyms do not arrive together.
TOPIC_WEIGHT = {'other': 4, 'time': 2.5, 'school': 1.5, 'shopping': 1.5}


def weight(w):
    return TOPIC_WEIGHT.get(w['topic'], 1) * (4 if w['pattern'].startswith('plural') else 1)


# Nouns that are not counted, so the game never asks for "pět mlék" or "dvě krve".
MASS = {'krev', 'mléko', 'cukr', 'bláto', 'máslo', 'sůl', 'mouka', 'pepř', 'med', 'rýže', 'maso', 'písek',
        'zlato', 'stříbro', 'železo', 'sníh', 'led', 'kouř', 'prach', 'olej', 'ocet', 'hrách', 'vzduch',
        'benzín', 'nafta', 'zdraví', 'mládí', 'štěstí', 'počasí', 'hudba', 'nábytek', 'zboží', 'oblečení'}
ARCHAIC = {'páně', 'dnové', 'koňové'}
# Cells where the Wiktionary table is incomplete or leads with a rare form: (word, number, case) → cell.
OVERRIDES = {
    ('rok', 'pl', 1): 'let / roků',        # pět let
    ('den', 'sg', 5): 'dni / dnu',         # o dni, not "o dne"
    ('kůň', 'pl', 0): 'koně',
    ('most', 'sg', 5): 'mostě / mostu',
}


def clean_cell(cell):
    # "kluci / (nářečně) klucí" → "kluci"; "hus, husí" → "hus / husí"; "—" → ""
    out = []
    for v in re.split(r'\s*[/,]\s*', cell):
        v = v.strip()
        if not v or v == '—' or '(' in v or v in ARCHAIC:
            continue
        out.append(v)
    return ' / '.join(out)


def forms_of(w):
    # the full paradigm, [sg[7], pl[7]], each cell "a / b" when there are variants;
    # only checked tables (Wiktionary or entered by hand), never ones generated from the pattern.
    # Uncountable and singular-only nouns get an empty plural, so no plural frame is asked.
    d = decl.get(w['cs'])
    if not d or d.get('source') == 'generated' or len(d.get('sg') or []) != 7 or len(d.get('pl') or []) != 7:
        return None
    sg, pl = [clean_cell(x) for x in d['sg']], [clean_cell(x) for x in d['pl']]
    for (cs, num, i), cell in OVERRIDES.items():
        if cs == w['cs']:
            (sg if num == 'sg' else pl)[i] = cell
    if w['cs'] in MASS or 'sg. only' in w['pattern']:
        pl = [''] * 7
    if w['pattern'].startswith('plural'):
        sg = [''] * 7
    if not all(sg) and not all(pl):
        return None
    return [sg, pl]


cards = []
for f in ['words.json', 'words-a2.json', 'words-b1.json', 'words-b2.json']:
    words = json.load(open(os.path.join(src, f), encoding='utf-8'))
    order = sorted(range(len(words)), key=lambda i: (rank_of(words[i]) is None, (rank_of(words[i]) or 0) * weight(words[i]), i))
    for i in order:
        w = words[i]
        svg = re.sub(r'\s+', ' ', w['svg']).strip().replace('> <', '><')
        cards.append([w['cs'], w['en'], w['gender'], w['pattern'], w['level'], w['topic'],
                      mask_answer(w['cs'], svg), forms_of(w)])
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('[\n' + ',\n'.join(json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in cards) + '\n]\n')
print(len(cards), 'cards ->', os.path.normpath(out), os.path.getsize(out), 'bytes;',
      sum('class="ans"' in c[6] for c in cards), 'with masked labels;',
      sum(c[7] is not None for c in cards), 'with forms')
