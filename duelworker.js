"use strict";
/* Web Worker du classement par duels avec « Ma campagne » (campduels.js) : joue des paires de duels avec le même simulateur et le même calcul que tools/build_duels.js.
   Messages : {type: "init", units, prof} -> {type: "ready"} ; {type: "run", id, pairs: Int32Array [i, j, i, j…]} -> {type: "done", id, out: Float32Array (une marge par paire)}. */
importScripts("sim.js", "duelcalc.js");
let DC = null, units = null, prof = null;
onmessage = e => {
  const m = e.data;
  if (m.type === "init") { units = m.units; prof = m.prof; DC = DuelCalc.make(self.TWW3Sim, units); postMessage({type: "ready"}); }
  else if (m.type === "run") {
    const p = m.pairs, out = new Float32Array(p.length / 2);
    for (let k = 0; k < out.length; k++) out[k] = DC.duelProf(units[p[2 * k]], units[p[2 * k + 1]], "cost", prof);
    postMessage({type: "done", id: m.id, out}, [out.buffer]);
  }
};
