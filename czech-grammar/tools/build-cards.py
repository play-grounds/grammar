#!/usr/bin/env python3
"""Build cards.json from the nouns deck (czech-grammar/nouns, words*.json).

Usage: python3 tools/build-cards.py [path/to/nouns]   (default ~/ideas/czech)
Each card is a compact array: [cs, en, gender, pattern, level, topic, svg].
Levels come in order, A1 first. Within a level the deck files are grouped by
gender, so the cards are dealt round-robin Ma, Mi, F, N (deck order kept within
each gender) and a learner meets all four genders from the first day.
"""
from itertools import zip_longest
import json, os, re, sys

src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/ideas/czech')
out = os.path.join(os.path.dirname(__file__), '..', 'cards.json')
cards = []
for f in ['words.json', 'words-a2.json', 'words-b1.json', 'words-b2.json']:
    words = json.load(open(os.path.join(src, f), encoding='utf-8'))
    by_gender = [[w for w in words if w['gender'] == g] for g in ('ma', 'mi', 'f', 'n')]
    for row in zip_longest(*by_gender):
        for w in row:
            if w is None:
                continue
            svg = re.sub(r'\s+', ' ', w['svg']).strip().replace('> <', '><')
            cards.append([w['cs'], w['en'], w['gender'], w['pattern'], w['level'], w['topic'], svg])
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('[\n' + ',\n'.join(json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in cards) + '\n]\n')
print(len(cards), 'cards ->', os.path.normpath(out), os.path.getsize(out), 'bytes')
