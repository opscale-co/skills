// render/process.mjs — deterministic projection of process.json → process.mmd.
//
// Mermaid flowchart TD: a `t0` start node (first subprocess trigger), one
// `subgraph spXX` per subprocess, `sXX_YY` step nodes chained in order, and a
// `wXX` wait node (the subprocess's endsWith) between consecutive subprocesses.
// The final subprocess (endsWith "—") has no trailing wait. Step labels carry
// the short title; descriptions live in the JSON only.

// Mermaid quoted labels can't contain a double quote; keep them single-line.
const lbl = (s) => String(s).replace(/"/g, "'").replace(/\s+/g, ' ').trim();
const nn = (code) => code.slice(-2); // "SP-03-04" → "04", "SP-03" → "03"

export function renderProcessMmd(json) {
  const subs = json.subprocesses;
  const out = ['flowchart TD'];
  out.push(`%% module: ${lbl(json.module.subdomain)}`);

  subs.forEach((sp, i) => {
    const xx = nn(sp.code);
    if (i === 0) out.push(`  t0(["${lbl(sp.trigger)}"]) --> s${xx}_${nn(sp.steps[0].code)}`);

    out.push(`  subgraph sp${xx} ["${lbl(sp.code + ' ' + sp.name)}"]`);
    sp.steps.forEach((st, j) => {
      const node = `s${xx}_${nn(st.code)}["${nn(st.code)}) ${lbl(st.title)}"]`;
      if (j === 0) out.push(`    ${node}`);
      else out.push(`    s${xx}_${nn(sp.steps[j - 1].code)} --> ${node}`);
    });
    out.push('  end');

    const last = i === subs.length - 1;
    const lastStep = `s${xx}_${nn(sp.steps[sp.steps.length - 1].code)}`;
    if (!last) {
      out.push(`  ${lastStep} --> w${xx}(["wait: ${lbl(sp.endsWith)}"])`);
      const next = subs[i + 1];
      out.push(`  w${xx} --> s${nn(next.code)}_${nn(next.steps[0].code)}`);
    }
  });

  return out.join('\n') + '\n';
}

export function render(json) {
  return { 'process.mmd': renderProcessMmd(json) };
}
