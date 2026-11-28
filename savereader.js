"use strict";
/* Lecture d'une sauvegarde de campagne Warhammer III (.save) dans le navigateur, sans envoi nulle part.
   Format : ESF « CBAB » (arbre binaire ; spécification : projet RPFM, rpfm_lib/src/files/esf). Le fichier contient un ESF externe dont le dernier enfant
   COMPRESSED_DATA est l'ESF interne entier, compressé en LZMA1 (décodeur ci-dessous, ~150 lignes). On y lit, pour chaque faction JOUEUR (CAMPAIGN_PLAYERS_SETUP) :
   - les technologies recherchées (FACTION > FACTION_TECHNOLOGY_MANAGER > RESEARCHED_TECHS) ;
   - ses personnages (CHARACTER_DETAILS dont la 1re chaîne est la faction) : type et sous-type d'agent, rang, XP, points non dépensés et compétences prises avec leur niveau
     (CAMPAIGN_SKILLS > CAMPAIGN_SKILLS_BLOCK : [clé de compétence, niveau]).
   Les en-têtes CAMPAIGN_SKILLS valent [compétence innée, ensemble, bool, points non dépensés, rang, XP]. Validé sur une sauvegarde de la Légion du Tertre (rang 49 = 48 points + …). */
(function (root) {
  /* ---------- LZMA1 (flux « alone » sans l'en-tête de 13 octets : propriétés + taille fournies à part) ---------- */
  function lzma(inp, ip, props, outSize) {
    let d = props[0]; const lc = d % 9; d = (d / 9) | 0; const lp = d % 5, pb = (d / 5) | 0;
    const out = new Uint8Array(outSize), P = new Uint16Array(1846 + (0x300 << (lc + lp))).fill(1024);
    const IsMatch = 0, IsRep = 192, IsRepG0 = 204, IsRepG1 = 216, IsRepG2 = 228, IsRep0Long = 240, PosSlot = 432, SpecPos = 688, Align = 802, LenCoder = 818, RepLenCoder = 1332, Literal = 1846;
    let range = 0xFFFFFFFF, code = 0; ip++;                                         // 1er octet toujours 0
    for (let i = 0; i < 4; i++) code = ((code << 8) | inp[ip++]) >>> 0;
    const bit = i => {
      const pr = P[i], bound = (range >>> 11) * pr; let b;
      if (code < bound) { range = bound; P[i] = pr + ((2048 - pr) >> 5); b = 0; } else { range -= bound; code -= bound; P[i] = pr - (pr >> 5); b = 1; }
      if (range < 0x1000000) { range = (range << 8) >>> 0; code = ((code << 8) | inp[ip++]) >>> 0; }
      return b;
    };
    const tree = (base, n) => { let m = 1; for (let i = 0; i < n; i++) m = (m << 1) | bit(base + m); return m - (1 << n); };
    const rtree = (base, n) => { let m = 1, s = 0; for (let i = 0; i < n; i++) { const b = bit(base + m); m = (m << 1) | b; s |= b << i; } return s; };
    const direct = n => { let r = 0; for (let i = 0; i < n; i++) { range >>>= 1; let b = 0; if (code >= range) { code -= range; b = 1; } r = ((r << 1) | b) >>> 0;
      if (range < 0x1000000) { range = (range << 8) >>> 0; code = ((code << 8) | inp[ip++]) >>> 0; } } return r; };
    const len = (base, ps) => !bit(base) ? tree(base + 2 + (ps << 3), 3) : !bit(base + 1) ? 8 + tree(base + 130 + (ps << 3), 3) : 16 + tree(base + 258, 8);
    let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, pos = 0; const pbm = (1 << pb) - 1, lpm = (1 << lp) - 1;
    while (pos < outSize) {
      const ps = pos & pbm;
      if (!bit(IsMatch + (state << 4) + ps)) {
        const prev = pos ? out[pos - 1] : 0, base = Literal + 0x300 * (((pos & lpm) << lc) + (prev >> (8 - lc)));
        let sym = 1;
        if (state >= 7) { let mb = out[pos - rep0 - 1]; do { const m = (mb >> 7) & 1; mb <<= 1; const b = bit(base + ((1 + m) << 8) + sym); sym = (sym << 1) | b; if (m !== b) break; } while (sym < 0x100); }
        while (sym < 0x100) sym = (sym << 1) | bit(base + sym);
        out[pos++] = sym & 255; state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6; continue;
      }
      let l;
      if (bit(IsRep + state)) {
        if (!bit(IsRepG0 + state)) { if (!bit(IsRep0Long + (state << 4) + ps)) { state = state < 7 ? 9 : 11; out[pos] = out[pos - rep0 - 1]; pos++; continue; } }
        else { let dist; if (!bit(IsRepG1 + state)) dist = rep1; else { if (!bit(IsRepG2 + state)) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; } rep1 = rep0; rep0 = dist; }
        l = len(RepLenCoder, ps); state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2; rep2 = rep1; rep1 = rep0; l = len(LenCoder, ps); state = state < 7 ? 7 : 10;
        const slot = tree(PosSlot + ((l < 4 ? l : 3) << 6), 6);
        if (slot < 4) rep0 = slot;
        else { const nd = (slot >> 1) - 1; rep0 = ((2 | (slot & 1)) << nd) >>> 0;
          if (slot < 14) rep0 += rtree(SpecPos + rep0 - slot - 1, nd); else { rep0 += (direct(nd - 4) << 4) >>> 0; rep0 += rtree(Align, 4); } rep0 >>>= 0; }
        if (rep0 === 0xFFFFFFFF) break;
      }
      l += 2; let from = pos - rep0 - 1; if (from < 0) throw new Error("LZMA : distance invalide");
      for (; l > 0 && pos < outSize; l--) out[pos++] = out[from++];
    }
    return out;
  }

  /* ---------- ESF ---------- */
  const SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 2, 8: 4, 9: 8, 10: 4, 11: 8, 12: 8, 13: 12, 14: 4, 15: 4, 16: 2, 18: 0, 19: 0, 20: 0, 21: 0, 22: 1, 23: 2, 24: 3, 25: 0, 26: 1, 27: 2, 28: 3, 29: 0, 33: 4, 35: 1, 36: 2, 37: 4};
  function Reader(b, p) { this.b = b; this.p = p || 0; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  Reader.prototype = {
    u8() { return this.b[this.p++]; }, u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }, u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; },
    cau() { let v = 0, c = this.b[this.p++]; while (c & 0x80) { v = (v * 128) + (c & 0x7f); c = this.b[this.p++]; } return v * 128 + (c & 0x7f); },
  };
  const dec8 = new TextDecoder("utf-8"), dec16 = new TextDecoder("utf-16le");
  function tables(b) {
    const r = new Reader(b); if (r.u32() !== 0xABCB) throw new Error("Ce fichier n'est pas une sauvegarde reconnue (signature ESF « CBAB » absente).");
    r.u32(); r.u32(); const off = r.u32(), start = r.p; r.p = off;
    const n = r.u16(), names = []; for (let i = 0; i < n; i++) { const l = r.u16(); names.push(dec8.decode(b.subarray(r.p, r.p + l))); r.p += l; }
    let c = r.u32(); const s16 = new Map(); for (let i = 0; i < c; i++) { const l = r.u32(); const t = dec16.decode(b.subarray(r.p, r.p + l * 2)); r.p += l * 2; s16.set(r.u32(), t); }
    c = r.u32(); const s8 = new Map(); for (let i = 0; i < c; i++) { const l = r.u32(); const t = dec8.decode(b.subarray(r.p, r.p + l)); r.p += l; s8.set(r.u32(), t); }
    return {names, s16, s8, start, off};
  }
  /* Décodage complet d'un nœud : enregistrement {name, groups: [[nœuds]]} ou valeur {t, v} (les tableaux restent des sous-tableaux d'octets, non copiés). */
  function node(r, T, isRoot) {
    const t = r.u8();
    if (t & 0x80) {
      let ni; if ((t & 0x20) || isRoot) { ni = r.u16(); r.u8(); } else ni = ((t & 1) << 8) + r.u8();
      const size = r.cau(), gc = (t & 0x40) ? r.cau() : 1, endB = r.p + size, groups = [];
      for (let g = 0; g < gc; g++) { const end = (t & 0x40) ? r.cau() + r.p : endB; const l = []; while (r.p < end) l.push(node(r, T, false)); groups.push(l); }
      return {name: T.names[ni], groups};
    }
    if (t in SIZE) {
      switch (t) {
        case 8: return {t: "u32", v: r.u32()}; case 20: return {t: "u32", v: 0}; case 21: return {t: "u32", v: 1}; case 22: return {t: "u32", v: r.u8()};
        case 23: return {t: "u32", v: r.u16()}; case 24: { const v = (r.b[r.p] << 16) | (r.b[r.p + 1] << 8) | r.b[r.p + 2]; r.p += 3; return {t: "u32", v}; }
        case 14: return {t: "s", v: T.s16.get(r.u32())}; case 15: return {t: "s", v: T.s8.get(r.u32())};
        case 18: return {t: "bool", v: true}; case 19: return {t: "bool", v: false}; case 1: return {t: "bool", v: !!r.u8()};
        default: r.p += SIZE[t]; return {t: "x" + t, v: null};
      }
    }
    if (t === 0x26) { const fb = r.u8(); r.p += (fb % 8 === 0 && fb !== 0) ? fb : 7; if (r.p < r.b.length && r.b[r.p] === 0x9C) r.p++; return {t: "u26"}; }
    if (t >= 0x41 && t <= 0x5d) { const sz = r.cau(); const v = r.b.subarray(r.p, r.p + sz); r.p += sz; return {t: "arr" + t, v}; }
    throw new Error("Type de nœud inconnu : 0x" + t.toString(16) + " à l'octet " + r.p);
  }
  /* Parcours rapide : appelle visit(nom, position, taille, profondeur) pour chaque enregistrement et saute les valeurs. */
  function skim(b, T, visit) {
    const r = new Reader(b, T.start);
    (function walk(isRoot, depth) {
      const pos = r.p, t = r.u8();
      if (t & 0x80) {
        let ni; if ((t & 0x20) || isRoot) { ni = r.u16(); r.u8(); } else ni = ((t & 1) << 8) + r.u8();
        const size = r.cau(), gc = (t & 0x40) ? r.cau() : 1, endB = r.p + size;
        const go = visit(T.names[ni], pos, size, depth);
        if (go !== false) for (let g = 0; g < gc; g++) { const end = (t & 0x40) ? r.cau() + r.p : endB; while (r.p < end) walk(false, depth + 1); }
        r.p = endB; return;
      }
      if (t in SIZE) r.p += SIZE[t];
      else if (t === 0x26) { const fb = r.u8(); r.p += (fb % 8 === 0 && fb !== 0) ? fb : 7; if (r.p < b.length && b[r.p] === 0x9C) r.p++; }
      else if (t >= 0x41 && t <= 0x5d) { const sz = r.cau(); r.p += sz; }
      else throw new Error("Type de nœud inconnu : 0x" + t.toString(16));
    })(true, 0);
  }
  const at = (b, T, pos) => node(new Reader(b, pos), T, false);
  const vals = (arr, t) => arr.filter(n => n.t === t).map(n => n.v);
  const rec = (arr, name) => arr.find(n => n.name === name);
  /* Première chaîne de premier niveau d'un CHARACTER_DETAILS (= faction du personnage), sans décoder le reste : on s'arrête dès qu'on la trouve. */
  function firstString(b, T, pos) {
    const r = new Reader(b, pos), t = r.u8(); if ((t & 0x20)) { r.u16(); r.u8(); } else r.u8();
    const size = r.cau(); if (t & 0x40) { r.cau(); r.cau(); } const end = r.p + size;
    while (r.p < end) { const n = node(r, T, false); if (n.t === "s") return n.v; }
    return null;
  }

  function read(buf, progress) {
    const say = progress || (() => {}), b0 = new Uint8Array(buf), T0 = tables(b0);
    say("Lecture de l'en-tête…");
    const r0 = new Reader(b0, T0.start), top = node(r0, T0, true);
    if (top.name !== "CAMPAIGN_SAVE_GAME") throw new Error("Ce fichier n'est pas une sauvegarde de campagne (racine : " + top.name + ").");
    const header = rec(top.groups[0], "SAVE_GAME_HEADER"), cd = rec(top.groups[0], "COMPRESSED_DATA");
    if (!cd) throw new Error("Sauvegarde sans section compressée : format non pris en charge.");
    const data = cd.groups[0][0].v, info = cd.groups[0][1], len = info.groups[0][0].v, props = info.groups[0][1].v;
    say("Décompression de la campagne (" + Math.round(len / 1048576) + " Mo)…");
    const b = lzma(data, 0, props, len), T = tables(b);
    say("Recherche des factions et des personnages…");
    const where = {players: null, factions: [], details: []};
    skim(b, T, (name, pos, size, depth) => {
      if (name === "CAMPAIGN_PLAYERS_SETUP") where.players = pos;
      else if (name === "FACTION") { where.factions.push(pos); return false; }
      else if (name === "CHARACTER_DETAILS") { where.details.push(pos); return false; }
      else if (name === "CAI_INTERFACE") return false;                                 // énorme et inutile
    });
    const human = {};                                                                  // faction -> étiquette (FULL_HUMAN…)
    if (where.players !== null) {
      const ps = at(b, T, where.players), rs = ps.groups[0][0];
      for (const g of rs.groups) { const s = vals(g, "s"); if (s[0] && s[1] && s[1] !== "NON_HUMAN") human[s[0]] = s[1]; }
    }
    const keys = Object.keys(human);
    const out = {saveName: null, build: null, factions: {}, humans: keys};
    for (const k of keys) out.factions[k] = {key: k, techs: [], chars: []};
    say("Lecture des technologies…");
    for (const pos of where.factions) {
      const r = new Reader(b, pos), t = r.u8(); if (t & 0x20) { r.u16(); r.u8(); } else r.u8(); r.cau(); if (t & 0x40) { r.cau(); r.cau(); }
      const a = node(r, T, false), c = node(r, T, false);                    // 1er enfant : numéro, 2e : clé de la faction
      if (c.t !== "s" || !(c.v in out.factions)) continue;
      const f = at(b, T, pos), tm = rec(f.groups[0], "FACTION_TECHNOLOGY_MANAGER");
      if (tm) { const rt = rec(tm.groups[0], "RESEARCHED_TECHS"); if (rt) out.factions[c.v].techs = rt.groups.map(g => g[0] && g[0].v).filter(Boolean); }
    }
    say("Lecture des personnages…");
    for (const pos of where.details) {
      const fk = firstString(b, T, pos); if (!(fk in out.factions)) continue;
      const n = at(b, T, pos), ch = n.groups[0], i = ch.findIndex(x => x.name === "CAMPAIGN_SKILLS"); if (i < 2) continue;
      const hdr = ch[i].groups[0].filter(x => !x.name).map(x => x.v), blk = rec(ch[i].groups[0], "CAMPAIGN_SKILLS_BLOCK"), skills = {};
      if (blk) for (const g of blk.groups) { const k = vals(g, "s")[0], v = vals(g, "u32")[0]; if (k) skills[k] = v; }
      const rank = hdr[4] || 0; if (!rank) continue;
      out.factions[fk].chars.push({type: ch[i - 2].v, st: ch[i - 1].v, rank, xp: hdr[5] || 0, unspent: hdr[3] || 0, skills});
    }
    for (const k of keys) out.factions[k].chars.sort((x, y) => y.rank - x.rank || y.xp - x.xp);
    return out;
  }
  root.SaveReader = {read, lzma};
  if (typeof module !== "undefined") module.exports = root.SaveReader;
})(typeof window !== "undefined" ? window : globalThis);
