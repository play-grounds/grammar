#!/usr/bin/env python3
"""Render og.png, the 1200x630 social preview, from the deck's own pictures.

Usage: python3 tools/og.py   (needs the snap Chromium; reads cards.json)
"""
import html, json, os, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CHROME = '/snap/bin/chromium'
# snap Chromium can only read files under a non-hidden folder in the home directory
WORK = os.path.expanduser('~/snap/chromium/common/slovicka-og')
COLOUR = {'ma': '#11457e', 'mi': '#1f7ab8', 'f': '#d7141a', 'n': '#237a3c'}
ARTICLE = {'ma': 'ten', 'mi': 'ten', 'f': 'ta', 'n': 'to'}
# three rows of three stickers, the genders mixed
PICK = ['pes', 'kočka', 'dům', 'žena', 'auto', 'vlak', 'jablko', 'škola', 'muž']
STARS = [3, 3, 2, 3, 2, 1, 3, 2, 3]

cards = {c[0]: c for c in json.load(open(os.path.join(ROOT, 'cards.json'), encoding='utf-8'))}
cat = open(os.path.join(ROOT, 'icon.svg'), encoding='utf-8').read()
stickers = ''.join(f'''<div class="s" style="--g:{COLOUR[cards[w][2]]};--r:{(i % 3 - 1) * 2.5}deg">
  <svg viewBox="0 0 120 100">{cards[w][6]}</svg><b>{html.escape(w)}</b>
  <i>{'★' * STARS[i]}<span>{'★' * (3 - STARS[i])}</span></i></div>''' for i, w in enumerate(PICK))
n = len(cards)

page = f'''<!doctype html><meta charset="utf-8"><style>
  body {{ margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fff7ea; color: #2b2b2b;
         font-family: "Nunito", "Segoe UI", "Trebuchet MS", sans-serif; position: relative; }}
  .left {{ position: absolute; left: 64px; top: 58px; width: 520px; }}
  .brand {{ display: flex; align-items: center; gap: 18px; }}
  .brand svg {{ width: 118px; height: 98px; }}
  h1 {{ margin: 0; font-size: 84px; letter-spacing: -2px; line-height: 1; }}
  .tag {{ margin: 26px 0 0; font-size: 38px; font-weight: 800; line-height: 1.2; }}
  .sub {{ margin: 14px 0 0; font-size: 25px; font-weight: 700; color: #736b60; }}
  .pills {{ display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }}
  .pills span {{ background: #fff; border-radius: 999px; padding: 10px 18px; font-size: 22px; font-weight: 800;
                box-shadow: 0 6px 16px rgba(80,50,20,.12); }}
  .genders {{ display: flex; gap: 10px; margin-top: 28px; font-size: 22px; font-weight: 800; }}
  .genders span {{ color: #fff; border-radius: 8px; padding: 3px 10px; }}
  .grid {{ position: absolute; right: 56px; top: 42px; display: grid; grid-template-columns: repeat(3, 162px); gap: 16px; }}
  .s {{ background: #fff; border-radius: 20px; border-top: 8px solid var(--g); padding: 8px 6px 6px; text-align: center;
        box-shadow: 0 8px 22px rgba(80,50,20,.14); transform: rotate(var(--r)); }}
  .s svg {{ width: 140px; height: 112px; display: block; margin: 0 auto; }}
  .s b {{ display: block; font-size: 24px; color: var(--g); line-height: 1.1; }}
  .s i {{ font-style: normal; color: #a86b00; font-size: 16px; letter-spacing: 2px; }}
  .s i span {{ color: #d6cbb8; }}
</style>
<div class="left">
  <div class="brand">{cat}<h1>Slovíčka</h1></div>
  <p class="tag">Learn Czech nouns<br>as a picture game</p>
  <p class="sub">{n:,} words · A1 to B2 · spaced repetition</p>
  <div class="pills"><span>🔥 streaks</span><span>🎯 daily quests</span><span>📒 sticker album</span><span>📶 works offline</span></div>
  <div class="genders"><span style="background:#11457e">ten · Ma</span><span style="background:#1f7ab8">ten · Mi</span><span style="background:#d7141a">ta · F</span><span style="background:#237a3c">to · N</span></div>
</div>
<div class="grid">{stickers}</div>'''

os.makedirs(WORK, exist_ok=True)
hp = os.path.join(WORK, 'og.html')
png = os.path.join(WORK, 'og.png')
open(hp, 'w', encoding='utf-8').write(page)
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630',
                f'--screenshot={png}', 'file://' + hp], capture_output=True, text=True, timeout=120)
out = os.path.join(ROOT, 'og.png')
os.replace(png, out)
os.remove(hp)
os.rmdir(WORK)
print(out, os.path.getsize(out), 'bytes')
