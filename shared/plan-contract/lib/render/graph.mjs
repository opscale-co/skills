// render/graph.mjs — deterministic projection of graph.json → graph.html.
//
// graph.html is a SINGLE self-contained HTML file (inline CSS + JS, no network,
// no external/CDN refs — opens offline). It is the deterministic projection of
// the nested graph.json, with every card's content INLINED at render time by
// dereferencing each node's `ref` into the four Plan source files
// (process/dbml/bpmn/sipoc). The graph.json carries only {id, ref} nodes; all
// human content (titles, descriptions, fields, SIPOC detail) is derived here.
//
// Behaviour of the rendered page (progressive disclosure, starts collapsed):
//   module card → subprocess cards → step cards → operation cards; a logic
//   operation expands to its SIPOC (logic) card + its nested composed child
//   operations; a crud operation expands to the entity card it acts on.

// ── JSON Pointer (RFC 6901, array-aware) ──────────────────────────────────────
function resolvePointer(doc, pointer) {
  if (pointer === '' || pointer === '/') return doc;
  const parts = pointer.replace(/^\//, '').split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = doc;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    const key = Array.isArray(cur) && /^\d+$/.test(p) ? Number(p) : p;
    cur = cur[key];
  }
  return cur;
}

function deref(ref, docs) {
  const m = String(ref || '').match(/^([a-z]+)\.json#(.*)$/);
  if (!m) return undefined;
  const doc = docs[m[1]];
  return doc ? resolvePointer(doc, m[2]) : undefined;
}

const titleCase = (s) =>
  String(s).replace(/(^|[\s_-])(\w)/g, (_, p, c) => p.replace(/[_-]/, ' ') + c.toUpperCase()).trim();
const tableName = (code) => String(code).replace(/-/g, '_');

// ── build the display model DATA by walking graph.json + dereferencing refs ───
function buildData(graphJson, docs) {
  const { process: proc, dbml, sipoc } = docs;
  const entityName = new Map((dbml.entities || []).map((e) => [e.code, e.name]));

  const mod = deref(graphJson.module?.ref, docs) || proc.module || {};
  const subdomainId = mod.subdomain || '';
  const module = {
    name: titleCase(subdomainId.split('/').filter(Boolean).pop() || subdomainId || 'Module'),
    software: mod.software || '',
    domain: mod.domain || '',
    subdomain: subdomainId,
  };

  const buildOp = (opNode) => {
    const op = deref(opNode.ref, docs) || {};
    const out = { id: opNode.id, type: op.type || 'crud', description: op.description || '' };
    if (op.type === 'crud') {
      out.action = op.action || '';
      out.entity = op.entity || '';
      out.entityName = entityName.get(op.entity) || op.entity || '';
      out.table = op.entity ? tableName(op.entity) : '';
    } else if (op.type === 'logic') {
      out.logicId = op.id || '';
      out.rules = op.rules || [];
      out.composed = (opNode.operations || []).map(buildOp);
    } else if (op.type === 'output') {
      out.content = op.content || '';
    }
    return out;
  };

  const subprocesses = (graphJson.subprocesses || []).map((spNode) => {
    const sp = deref(spNode.ref, docs) || {};
    return {
      id: spNode.id,
      title: sp.name || spNode.id,
      trigger: sp.trigger || '',
      endsWith: sp.endsWith || '',
      steps: (spNode.steps || []).map((stNode) => {
        const st = deref(stNode.ref, docs) || {};
        return {
          id: stNode.id,
          title: st.title || stNode.id,
          description: st.description || '',
          operations: (stNode.operations || []).map(buildOp),
        };
      }),
    };
  });

  const entities = {};
  for (const e of dbml.entities || []) {
    entities[e.code] = {
      name: e.name || e.code,
      table: tableName(e.code),
      description: e.description || '',
      fields: (e.fields || []).map((f) => ({
        code: f.code,
        type: f.enum
          ? `enum ${f.enum}`
          : f.foreignKey
            ? `→ ${f.foreignKey}`
            : f.externalRef
              ? `⇗ ${f.externalRef}`
              : f.type || 'field',
        nullable: f.nullable === true,
        description: f.description || '',
      })),
    };
  }

  const logics = {};
  for (const s of sipoc.sipocs || []) logics[s.id] = s;

  return { module, subprocesses, entities, logics };
}

// ── the client page (CSS + JS inlined; no network, no external refs) ──────────
const STYLE = `
:root{color-scheme:light dark;
  --bg:#f6f7f9;--fg:#1a1d24;--muted:#5b6472;--line:#d9dde4;--card:#ffffff;
  --sp:#2563eb;--step:#0e7490;--crud:#15803d;--logic:#9333ea;--output:#b45309;
  --entity:#0f766e;--accent:#334155;}
@media (prefers-color-scheme:dark){:root{
  --bg:#0f1115;--fg:#e6e9ef;--muted:#9aa4b2;--line:#2a2f3a;--card:#171a21;
  --sp:#60a5fa;--step:#22d3ee;--crud:#4ade80;--logic:#c084fc;--output:#fbbf24;
  --entity:#2dd4bf;--accent:#cbd5e1;}}
:root[data-theme=dark]{
  --bg:#0f1115;--fg:#e6e9ef;--muted:#9aa4b2;--line:#2a2f3a;--card:#171a21;
  --sp:#60a5fa;--step:#22d3ee;--crud:#4ade80;--logic:#c084fc;--output:#fbbf24;
  --entity:#2dd4bf;--accent:#cbd5e1;}
:root[data-theme=light]{
  --bg:#f6f7f9;--fg:#1a1d24;--muted:#5b6472;--line:#d9dde4;--card:#ffffff;
  --sp:#2563eb;--step:#0e7490;--crud:#15803d;--logic:#9333ea;--output:#b45309;
  --entity:#0f766e;--accent:#334155;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.wrap{max-width:900px;margin:0 auto;padding:24px 18px 80px}
header h1{margin:0 0 2px;font-size:20px}
header p{margin:0 0 20px;color:var(--muted);font-size:13px}
.tree{display:flex;flex-direction:column;gap:8px}
.children{display:none;flex-direction:column;gap:8px;margin:8px 0 2px 20px;
  padding-left:14px;border-left:2px solid var(--line)}
.card.open>.children{display:flex}
.card{border:1px solid var(--line);border-radius:10px;background:var(--card);
  overflow:hidden}
.card-head{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;
  user-select:none}
.card-head:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.card.leaf>.card-head{cursor:default}
.twisty{width:14px;flex:0 0 14px;color:var(--muted);transition:transform .15s;font-size:11px}
.card.open>.card-head .twisty{transform:rotate(90deg)}
.card.leaf>.card-head .twisty{visibility:hidden}
.badge{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  padding:3px 6px;border-radius:5px;color:#fff;white-space:nowrap}
.ttl{font-weight:600}
.sub{color:var(--muted);font-size:13px;font-weight:400}
.kind{margin-left:auto;font-size:11px;color:var(--muted);text-transform:uppercase;
  letter-spacing:.04em}
.card-module>.card-head .badge{background:var(--accent)}
.card-subprocess>.card-head .badge{background:var(--sp)}
.card-step>.card-head .badge{background:var(--step)}
.op-crud>.card-head .badge{background:var(--crud)}
.op-logic>.card-head .badge{background:var(--logic)}
.op-output>.card-head .badge{background:var(--output)}
.card-entity{border-color:var(--entity)}
.card-entity>.card-head .badge{background:var(--entity)}
.card-logic{border-color:var(--logic)}
.card-logic>.card-head .badge{background:var(--logic)}
.detail{padding:4px 14px 14px;font-size:13px}
.detail h4{margin:12px 0 4px;font-size:12px;text-transform:uppercase;
  letter-spacing:.05em;color:var(--muted)}
.detail p{margin:4px 0}
.detail ul{margin:4px 0;padding-left:18px}
table.fields{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
table.fields th,table.fields td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);
  vertical-align:top}
table.fields th{color:var(--muted);font-weight:600}
code{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.toolbar{display:flex;gap:8px;margin-bottom:16px}
button.tb{font:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--line);
  border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer}
button.tb:hover{border-color:var(--accent)}
`;

// The whole card tree is SERVER-RENDERED to static HTML (so it is present and
// greppable without JS, and works if JS is disabled); a tiny delegated script
// only wires expand/collapse. No network, no external refs.
const SCRIPT = String.raw`
(function(){
  var tree=document.getElementById('tree');
  function toggle(head){
    var card=head.parentElement;
    if(card.classList.contains('leaf'))return;
    var open=card.classList.toggle('open');
    head.setAttribute('aria-expanded',open?'true':'false');
  }
  tree.addEventListener('click',function(e){
    var head=e.target.closest('.card-head');
    if(head&&tree.contains(head))toggle(head);
  });
  tree.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var head=e.target.closest('.card-head');
    if(head&&tree.contains(head)){e.preventDefault();toggle(head);}
  });
  function setAll(open){
    tree.querySelectorAll('.card').forEach(function(c){
      if(c.classList.contains('leaf'))return;
      c.classList.toggle('open',open);
      var h=c.querySelector(':scope>.card-head');
      if(h)h.setAttribute('aria-expanded',open?'true':'false');
    });
  }
  document.getElementById('expand').addEventListener('click',function(){setAll(true);});
  document.getElementById('collapse').addEventListener('click',function(){setAll(false);});
})();
`;

// ── server-side HTML builders (static card tree) ──────────────────────────────
const esc = (s) =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function head(badge, title, sub, kind) {
  return (
    `<div class="card-head" role="button" tabindex="0" aria-expanded="false">` +
    `<span class="twisty">▶</span>` +
    `<span class="badge">${esc(badge)}</span>` +
    `<span class="ttl">${esc(title)}${sub ? ` <span class="sub">${esc(sub)}</span>` : ''}</span>` +
    `<span class="kind">${esc(kind)}</span>` +
    `</div>`
  );
}
const card = (cls, headHtml, childrenHtml) =>
  childrenHtml
    ? `<div class="card ${cls}">${headHtml}<div class="children">${childrenHtml}</div></div>`
    : `<div class="card ${cls} leaf">${headHtml}</div>`;

function listBlock(title, arr, fmt) {
  if (!arr || !arr.length) return '';
  return `<h4>${esc(title)}</h4><ul>${arr.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`;
}

function entityCard(code, data) {
  const e = data.entities[code];
  if (!e) return card('card-entity', head(code, code, '(entity not found)', 'entity'), '');
  const rows = e.fields
    .map(
      (f) =>
        `<tr><td><code>${esc(f.code)}</code></td><td><code>${esc(f.type)}</code></td>` +
        `<td>${f.nullable ? 'yes' : 'no'}</td><td>${esc(f.description)}</td></tr>`
    )
    .join('');
  const detail =
    `<div class="detail"><p>${esc(e.description)}</p>` +
    `<h4>Fields</h4><table class="fields">` +
    `<tr><th>Field</th><th>Type</th><th>Null</th><th>Description</th></tr>${rows}</table></div>`;
  return card('card-entity', head(code, e.name, e.table, 'entity'), detail);
}

function logicCard(id, data) {
  const s = data.logics[id];
  if (!s) return card('card-logic', head(id, id, '(SIPOC not found)', 'logic'), '');
  const fm = s.failureModes || {};
  const detail =
    `<div class="detail"><p>${esc(s.description)}</p>` +
    listBlock('Inputs', s.inputs, (i) =>
      `<code>${esc(i.name)}</code> <span class="sub">${esc(i.type)}${i.validation ? ` · ${esc(i.validation)}` : ''}</span> — ${esc(i.description)}`) +
    listBlock('Process', s.process, (p) =>
      `<code>${esc(p.operation)}</code> — ${esc(p.description)}${p.rule ? ` <span class="sub">[${esc(p.rule)}]</span>` : ''}`) +
    listBlock('Outputs', s.outputs, (o) =>
      `<code>${esc(o.name)}</code> <span class="sub">${esc(o.type)}</span> — ${esc(o.description)}`) +
    listBlock('Business rules', s.businessRules, (b) => `<code>${esc(b.code)}</code> — ${esc(b.text)}`) +
    listBlock('Soft failures', fm.soft, (x) => esc(x)) +
    listBlock('Hard failures', fm.hard, (x) => esc(x)) +
    `</div>`;
  return card('card-logic', head(id, s.title || id, 'SIPOC', 'logic'), detail);
}

function opCard(op, data) {
  if (op.type === 'crud')
    return card('op-crud', head(op.id, `${op.action} ${op.table}`, op.description, 'crud'), entityCard(op.entity, data));
  if (op.type === 'logic') {
    const children =
      logicCard(op.logicId, data) + (op.composed || []).map((c) => opCard(c, data)).join('');
    const rules = op.rules && op.rules.length ? `[${op.rules.join(', ')}]` : '';
    return card('op-logic', head(op.id, op.logicId, rules, 'logic'), children);
  }
  return card('op-output', head(op.id, op.content, op.description, 'output'), ''); // output = leaf
}

function stepCard(st, data) {
  const children = st.operations.map((op) => opCard(op, data)).join('');
  return card('card-step', head(st.id, st.title, st.description, 'step'), children);
}
function subCard(sp, data) {
  const children = sp.steps.map((st) => stepCard(st, data)).join('');
  const sub = sp.endsWith ? `⟶ ${sp.endsWith}` : '';
  return card('card-subprocess', head(sp.id, sp.title, sub, 'subprocess'), children);
}
function moduleCard(data) {
  const m = data.module;
  const children = data.subprocesses.map((sp) => subCard(sp, data)).join('');
  return card('card-module', head('MODULE', m.name, `${m.domain} · ${m.software}`, 'module'), children);
}

export function render(graphJson, docs) {
  const data = buildData(graphJson, docs);
  const m = data.module;
  const title = `${m.name} — module graph`;
  const html =
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${esc(title)}</h1>
<p>${esc(`${m.subdomain} · ${m.domain} · ${m.software}`)} — interactive projection of graph.json</p>
</header>
<div class="toolbar">
<button class="tb" id="expand" type="button">Expand all</button>
<button class="tb" id="collapse" type="button">Collapse all</button>
</div>
<div class="tree" id="tree">
${moduleCard(data)}
</div>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
  return { 'graph.html': html };
}
