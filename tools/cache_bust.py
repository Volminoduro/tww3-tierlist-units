#!/usr/bin/env python3
"""Ajoute ?v=<empreinte du fichier> aux scripts et feuilles de style locaux de index.html.
Sans cela, GitHub Pages / le navigateur peuvent servir un app.js en cache avec un index.html neuf (ou l'inverse) : la page « plante ».
À lancer avant chaque commit qui change un .js / .css / data/*.js :  python tools/cache_bust.py"""
import hashlib, re, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
def bump(m):
    attr, path = m.group(1), m.group(2)
    f = root / path
    if not f.exists(): return m.group(0)
    return f'{attr}="{path}?v={hashlib.sha1(f.read_bytes()).hexdigest()[:8]}"'
new = re.sub(r'\b(src|href)="((?!https?:|//|#)[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"', bump, html)
if new != html: (root / "index.html").write_text(new, encoding="utf-8"); print("index.html mis à jour")
else: print("rien à changer")
