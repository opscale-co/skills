// render/sipoc.mjs — deterministic projection of sipoc.json → sipoc/<id>.md.
//
// One markdown file per SIPOC: an H1 title and a header block (Identifier /
// Business Rules / Composes), the one-sentence description paragraph, a
// `## SIPOC` 5-column matrix (Suppliers | Inputs | Process | Outputs |
// Customers), then the detailed `## Suppliers`, `## Inputs` table, `## Process`
// numbered list (each step = its bpmn composed-op code + description + (BR-NN),
// ending in `return result`), `## Outputs` table, `## Customers`, `## Business
// Rules` (each `code` — `text` from the single businessRules registry), and
// `## Failure modes` (Soft/Hard). Actors are plain text
// (no emoji). render(json) returns the map { 'sipoc/<id>.md': '<markdown>', … }.

// Table-cell safe: collapse newlines, trim.
const cell = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();

function renderMatrix(sipoc) {
  const supplierCol = sipoc.suppliers.map((s) => s.actor);
  const inputCol = sipoc.inputs.map((i) => i.name);
  const processCol = sipoc.process.map((p) => p.operation);
  const outputCol = sipoc.outputs.map((o) => o.name);
  const customerCol = sipoc.outputs.map((o) => o.consumer);

  const rows = Math.max(supplierCol.length, inputCol.length, processCol.length, outputCol.length, customerCol.length);
  const at = (col, i) => cell(col[i] ?? '');

  const out = [
    '## SIPOC',
    '',
    '| Suppliers | Inputs | Process | Outputs | Customers |',
    '|---|---|---|---|---|',
  ];
  for (let i = 0; i < rows; i++)
    out.push(`| ${at(supplierCol, i)} | ${at(inputCol, i)} | ${at(processCol, i)} | ${at(outputCol, i)} | ${at(customerCol, i)} |`);
  return out.join('\n');
}

function renderHeader(sipoc) {
  const composes = sipoc.composes.length ? sipoc.composes.join(', ') : 'none';
  const brs = sipoc.businessRules.length ? sipoc.businessRules.map((b) => b.code).join(', ') : 'none';
  return [
    `# SIPOC — ${cell(sipoc.title)}`,
    '',
    `**Identifier:** \`${sipoc.id}\``,
    `**Business Rules:** ${brs}`,
    `**Composes:** ${composes}`,
    '',
    cell(sipoc.description),
  ].join('\n');
}

function renderSuppliers(sipoc) {
  const lines = sipoc.suppliers.map((s) => `- ${cell(s.actor)} — ${cell(s.description)}`);
  return ['## Suppliers', ...lines].join('\n');
}

function renderInputs(sipoc) {
  const out = [
    '## Inputs',
    '| Input | Source | Type | Validation rules | Description |',
    '|-------|--------|------|------------------|-------------|',
  ];
  for (const i of sipoc.inputs)
    out.push(`| ${cell(i.name)} | ${cell(i.source)} | ${cell(i.type)} | ${cell(i.validation)} | ${cell(i.description)} |`);
  return out.join('\n');
}

function renderProcess(sipoc) {
  const out = ['## Process'];
  sipoc.process.forEach((p, i) => {
    const rule = p.rule ? ` (${p.rule})` : '';
    const desc = p.description ? ` ${cell(p.description)}` : '';
    out.push(`${i + 1}. \`${p.operation}\`${desc}${rule}`);
  });
  out.push(`${sipoc.process.length + 1}. return result`);
  return out.join('\n');
}

function renderOutputs(sipoc) {
  const out = [
    '## Outputs',
    '| Output | Consumer | Type | Description |',
    '|--------|----------|------|-------------|',
  ];
  for (const o of sipoc.outputs)
    out.push(`| ${cell(o.name)} | ${cell(o.consumer)} | ${cell(o.type)} | ${cell(o.description)} |`);
  return out.join('\n');
}

function renderCustomers(sipoc) {
  const lines = sipoc.customers.map((c) => `- ${cell(c.actor)} — ${cell(c.description)}`);
  return ['## Customers', ...lines].join('\n');
}

function renderBusinessRules(sipoc) {
  const lines = sipoc.businessRules.map((b) => `- **${b.code}** — ${cell(b.text)}`);
  return ['## Business Rules', ...lines].join('\n');
}

function renderFailureModes(sipoc) {
  return [
    '## Failure modes',
    `- **Soft failure** (returns \`success=false\` + \`message\`): ${cell(sipoc.failureModes.soft.join('; '))}`,
    `- **Hard failure** (throws): ${cell(sipoc.failureModes.hard.join('; '))}`,
  ].join('\n');
}

export function renderSipoc(sipoc) {
  const sections = [
    renderHeader(sipoc),
    renderMatrix(sipoc),
    renderSuppliers(sipoc),
    renderInputs(sipoc),
    renderProcess(sipoc),
    renderOutputs(sipoc),
    renderCustomers(sipoc),
    renderBusinessRules(sipoc),
    renderFailureModes(sipoc),
  ];
  return sections.join('\n\n') + '\n';
}

export function render(json) {
  const files = {};
  for (const sipoc of json.sipocs) files[`sipoc/${sipoc.id}.md`] = renderSipoc(sipoc);
  return files;
}
