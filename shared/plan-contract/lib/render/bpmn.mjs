// render/bpmn.mjs — deterministic projection of bpmn.json → bpmn.bpmn (BPMN 2.0 XML).
//
// The JSON (operations/subprocesses/gateways/events) is the source of truth; the
// .bpmn is a pure projection built with bpmn-moddle. Structure:
//   <bpmn:process> contains one EXPANDABLE <bpmn:subProcess> (isExpanded=true) per
//   subprocess. Each subProcess holds its own start/end events and its operations
//   as flow nodes: crud → <bpmn:serviceTask>, logic → <bpmn:businessRuleTask>. The
//   process-level spine is: start → sub(SP-01) → catch(SP-01) → sub(SP-02) → … → end,
//   where each catch is a subprocess-closing wait (the spec's endsWith).
//
// Every node carries a <bpmn:documentation> with the metadata JSON (lean shape,
// matching the hand-authored reference files): crud {type,code,entity,action,step,
// subprocess}; logic {type,code,id,step,subprocess,rules,operations}. A logic's
// child operations (crud/logic-ref/output) live ONLY inside the logic's
// `operations` array — never as their own nodes. bpmn.json's top-level `operations`
// is a nested map keyed by subprocess code → step code → ordered op array; the
// subprocess/step NAMES are NOT in bpmn.json, so they are taken from the sibling
// process.json. The process-doc {module,standard} is DERIVED at render time: the
// module from process.json, the modeling standard from dbml.json (bpmn.json no
// longer carries a `module` block).
//
// LAYOUT — deterministic manual DI (not bpmn-auto-layout). bpmn-auto-layout renders
// a subProcess as a COLLAPSED box with a separate drill-down BPMNPlane; it never
// produces an isExpanded container with its children nested in place. Because the
// contract requires expandable containers, we compute the DI ourselves: one plane,
// each subProcess shape isExpanded=true and sized to enclose its children, children
// laid out in a horizontal band inside. A sequence flow cannot cross a subProcess
// boundary in BPMN, so a gateway branch whose target lives in another subprocess is
// routed to the subprocess's own end event with the target oid preserved in the
// flow label (documented deviation).
import BpmnModdle from 'bpmn-moddle';

const moddle = new BpmnModdle();
const c = (type, props) => moddle.create(type, props);

// ── geometry ─────────────────────────────────────────────────────────────────
const EV = 36, TASK_W = 110, TASK_H = 80, GW = 50;
const PCY = 320;                 // process-level centerline
const PGAP = 80;                 // gap between process-level elements
const CONTAINER_H = 180;         // expanded subProcess height
const CONTAINER_TOP = PCY - CONTAINER_H / 2;
const CHILD_CY = CONTAINER_TOP + 95;   // children centerline inside a container
const INNER_PAD = 40, INNER_GAP = 45;  // container padding / inter-child gap

const sizeOf = (kind) =>
  kind === 'event' ? { w: EV, h: EV }
  : kind === 'gateway' ? { w: GW, h: GW }
  : { w: TASK_W, h: TASK_H };

// XML NCName from any string/oid.
const nc = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nameFromId = (id) => cap(String(id).replace(/-/g, ' '));
const lastSeg = (p) => String(p).split('/').pop();
const displayModule = (subdomain) =>
  lastSeg(subdomain).split(/[-_\s]+/).filter(Boolean).map(cap).join(' ') || subdomain;

// Stable-key JSON so documentation strings are deterministic.
const docJson = (obj) => JSON.stringify(obj);

export function render(json, processJson = {}, dbmlJson = {}) {
  const bounds = new Map();          // elementId → {x,y,w,h}
  const setB = (id, x, y, w, h) => bounds.set(id, { x, y, w, h });

  // ── index subprocesses (from process.json) + operations (bpmn.json map) ──────
  const subprocesses = processJson.subprocesses || [];
  const subByCode = new Map(subprocesses.map((s) => [s.code, s]));
  const subOf = (step) => step.slice(0, 5);        // "SP-01-02" → "SP-01"
  const subName = (code) => { const s = subByCode.get(code); return s ? s.name : code; };
  // The embedded process-doc is DERIVED: module from process.json, modeling
  // standard from dbml.json (bpmn.json no longer carries a `module` block).
  const subdomain = (processJson.module || {}).subdomain || '';
  const moduleName = displayModule(subdomain);
  const standard = (dbmlJson.standards || {}).modeling || '';
  const gateways = json.gateways || [];
  const events = json.events || [];

  // Flatten the nested operations map into {op, subCode, stepCode}; the step code
  // is the map key (no longer carried on the op), the subprocess code its prefix.
  const allOps = [];
  for (const [subCode, steps] of Object.entries(json.operations || {}))
    for (const [stepCode, arr] of Object.entries(steps))
      for (const op of arr) allOps.push({ op, subCode, stepCode });
  const opByCode = new Map(allOps.map((x) => [x.op.code, x]));

  // operation code → element id (so gateway branches can resolve targets)
  const opElId = new Map();
  for (const { op } of allOps) opElId.set(op.code, 'op_' + nc(op.code));

  // Build one businessRuleTask/serviceTask model per first-level operation.
  const nodeModels = new Map();      // code → moddle flow node
  for (const { op, stepCode, subCode } of allOps) {
    const subNm = subName(subCode);
    const elId = opElId.get(op.code);
    if (op.type === 'crud') {
      const text = docJson({
        type: 'crud', code: op.code, entity: op.entity, action: op.action,
        step: stepCode, subprocess: subNm,
      });
      nodeModels.set(op.code, c('bpmn:ServiceTask', {
        id: elId, name: `${op.action} ${op.entity}`,
        documentation: [c('bpmn:Documentation', { text })],
      }));
    } else {
      const operations = op.operations.map((m) =>
        m.type === 'crud' ? { code: m.code, entity: m.entity, action: m.action }
        : m.type === 'logic' ? { code: m.code, id: m.ref }
        : { code: m.code, content: m.content });
      const text = docJson({
        type: 'logic', code: op.code, id: op.id, step: stepCode, subprocess: subNm,
        rules: op.rules, operations,
      });
      nodeModels.set(op.code, c('bpmn:BusinessRuleTask', {
        id: elId, name: nameFromId(op.id),
        documentation: [c('bpmn:Documentation', { text })],
      }));
    }
  }

  // Gateway models (one per gateway, placed inside its subprocess).
  const gwModels = new Map();        // gateway.id → { model, sub, def }
  for (const gw of gateways) {
    const model = c('bpmn:ExclusiveGateway', { id: 'gw_' + nc(gw.id), name: gw.question });
    gwModels.set(gw.id, { model, sub: subOf(gw.step), def: gw });
  }

  // ── sequence flow helper ─────────────────────────────────────────────────────
  let flowN = 0;
  const flows = [];                  // {id, source, target, name}
  const link = (source, target, name) => {
    const id = 'flow_' + String(++flowN).padStart(3, '0');
    const f = c('bpmn:SequenceFlow', { id, sourceRef: source, targetRef: target, ...(name ? { name } : {}) });
    (source.outgoing || (source.outgoing = [])).push(f);
    (target.incoming || (target.incoming = [])).push(f);
    flows.push({ id, el: f, source, target });
    return f;
  };

  // ── build each subprocess container, lay children in a horizontal band ────────
  const subModels = [];              // { code, model, startEv, endEv }
  for (const sp of subprocesses) {
    const subStart = c('bpmn:StartEvent', { id: `sub_${nc(sp.code)}_start`, name: 'Inicio' });
    const subEnd = c('bpmn:EndEvent', { id: `sub_${nc(sp.code)}_end`, name: 'Fin' });

    // ordered spine items = this subprocess's operations by step then per-step
    // position, with each gateway inserted right after the last op of its step.
    const ops = allOps.filter((x) => x.subCode === sp.code)
      .sort((a, b) => a.stepCode.localeCompare(b.stepCode) || a.op.position - b.op.position);
    const gwsHere = gateways.filter((g) => subOf(g.step) === sp.code);
    const gwByStep = new Map();
    for (const g of gwsHere) (gwByStep.get(g.step) || gwByStep.set(g.step, []).get(g.step)).push(g);

    const spine = [subStart];
    ops.forEach((x, i) => {
      spine.push(nodeModels.get(x.op.code));
      const nextStep = ops[i + 1] ? ops[i + 1].stepCode : null;
      if (x.stepCode !== nextStep && gwByStep.has(x.stepCode)) {
        for (const g of gwByStep.get(x.stepCode)) spine.push(gwModels.get(g.id).model);
      }
    });
    // gateways whose step has no operation in this subprocess → append before end
    for (const g of gwsHere) {
      if (!ops.some((x) => x.stepCode === g.step)) spine.push(gwModels.get(g.id).model);
    }
    spine.push(subEnd);

    // linear chain through the spine (guarantees a connected, valid flow)
    for (let i = 0; i < spine.length - 1; i++) link(spine[i], spine[i + 1]);

    const flowElements = [...spine];
    subModels.push({ code: sp.code, name: sp.name, model: null, startEv: subStart, endEv: subEnd, spine, flowElements });
  }

  // gateway branch edges (added after all subprocess spines exist so cross-subprocess
  // targets are known). Same-subprocess target → labeled flow to the node; other →
  // labeled flow to this subprocess's end event, target oid kept in the label.
  for (const gw of gateways) {
    const { model, sub, def } = gwModels.get(gw.id);
    const sm = subModels.find((s) => s.code === sub);
    for (const br of def.branches) {
      const targetOp = opByCode.get(br.to);
      const sameSub = targetOp && targetOp.subCode === sub;
      if (sameSub) {
        const f = link(model, nodeModels.get(br.to), br.label);
        sm.flowElements.push(f);
      } else {
        const f = link(model, sm.endEv, `${br.label} → ${br.to}`);
        sm.flowElements.push(f);
      }
    }
  }
  // collect the spine flows into each subprocess's flowElements
  for (const sm of subModels) {
    for (const f of flows) {
      if (sm.spine.includes(f.source) && sm.spine.includes(f.target) && !sm.flowElements.includes(f.el))
        sm.flowElements.push(f.el);
    }
  }

  // ── process-level spine: start → sub → catch? → sub → … → [catch?] → end ──────
  const startDef = events.find((e) => e.type === 'start');
  const endDef = events.find((e) => e.type === 'end');
  const procStart = c('bpmn:StartEvent', { id: 'start_01', name: startDef ? startDef.name : 'Inicio' });
  const procEnd = c('bpmn:EndEvent', { id: 'end_01', name: endDef ? endDef.name : 'Fin' });

  const catchFor = (code) => events.find((e) => e.type === 'catch' && e.subprocess === code);
  const procItems = [procStart];              // ordered items for layout + chaining
  let catchN = 0;
  subprocesses.forEach((sp) => {
    const sm = subModels.find((s) => s.code === sp.code);
    const container = c('bpmn:SubProcess', { id: `sub_${nc(sp.code)}`, name: `${sp.code} ${sp.name}` });
    sm.model = container;
    procItems.push({ kind: 'sub', el: container, sm });
    const cd = catchFor(sp.code);
    if (cd) {
      const ev = c('bpmn:IntermediateCatchEvent', { id: `catch_${nc(sp.code)}_${++catchN}`, name: cd.name });
      procItems.push({ kind: 'event', el: ev });
    }
  });
  procItems.push(procEnd);

  // chain process-level items linearly
  const procEls = procItems.map((it) => (it.el ? it.el : it));   // moddle elements in order
  const procFlows = [];
  for (let i = 0; i < procEls.length - 1; i++) procFlows.push(link(procEls[i], procEls[i + 1]));

  // ── wire subprocess flowElements into their container ────────────────────────
  for (const sm of subModels) {
    sm.model.flowElements = sm.flowElements;
    sm.model.isExpanded = true;
  }

  // ── layout pass ──────────────────────────────────────────────────────────────
  // children of a container, then the container, then the process row.
  const layoutSub = (sm, originX) => {
    let cur = originX + INNER_PAD;
    for (const el of sm.spine) {
      const kind = el.$type === 'bpmn:StartEvent' || el.$type === 'bpmn:EndEvent' ? 'event'
        : el.$type === 'bpmn:ExclusiveGateway' ? 'gateway' : 'task';
      const { w, h } = sizeOf(kind);
      setB(el.id, Math.round(cur), Math.round(CHILD_CY - h / 2), w, h);
      cur += w + INNER_GAP;
    }
    const lastRight = cur - INNER_GAP;
    const width = lastRight - originX + INNER_PAD;
    return width;
  };

  let x = 60;
  for (const it of procItems) {
    if (it === procStart || it === procEnd) {
      setB(it.id, x, PCY - EV / 2, EV, EV); x += EV + PGAP;
    } else if (it.kind === 'event') {
      setB(it.el.id, x, PCY - EV / 2, EV, EV); x += EV + PGAP;
    } else if (it.kind === 'sub') {
      const width = layoutSub(it.sm, x);
      setB(it.el.id, x, CONTAINER_TOP, width, CONTAINER_H);
      x += width + PGAP;
    }
  }

  // ── DI: one plane, every shape + every edge ──────────────────────────────────
  const procId = 'proc_' + nc(lastSeg(subdomain));
  const shapes = [];
  const edges = [];
  const shape = (el, expanded) => {
    const b = bounds.get(el.id);
    const di = c('bpmndi:BPMNShape', {
      id: el.id + '_di', bpmnElement: el,
      bounds: c('dc:Bounds', { x: b.x, y: b.y, width: b.w, height: b.h }),
    });
    if (expanded) di.isExpanded = true;
    shapes.push(di);
  };

  // process-level shapes
  shape(procStart); shape(procEnd);
  for (const it of procItems) {
    if (it.el && it.kind === 'event') shape(it.el);
    if (it.el && it.kind === 'sub') {
      shape(it.el, true);                       // expanded container
      for (const el of it.sm.spine) shape(el);  // nested children
    }
  }
  // all edges (process-level + nested).
  for (const f of flows) {
    const a = bounds.get(f.source.id), b = bounds.get(f.target.id);
    const acy = a.y + a.h / 2, bcy = b.y + b.h / 2;
    const fwd = (b.x + b.w / 2) >= (a.x + a.w / 2);
    const sx = fwd ? a.x + a.w : a.x, tx = fwd ? b.x : b.x + b.w;
    edges.push(c('bpmndi:BPMNEdge', {
      id: f.id + '_di', bpmnElement: f.el,
      waypoint: [c('dc:Point', { x: Math.round(sx), y: Math.round(acy) }),
                 c('dc:Point', { x: Math.round(tx), y: Math.round(bcy) })],
    }));
  }

  // ── assemble definitions ─────────────────────────────────────────────────────
  const allProcFlowElements = [
    procStart, procEnd,
    ...procItems.filter((it) => it.el && it.kind === 'event').map((it) => it.el),
    ...subModels.map((s) => s.model),
    ...procFlows,
  ];
  const proc = c('bpmn:Process', {
    id: procId, isExecutable: false,
    documentation: [c('bpmn:Documentation', { text: docJson({ module: moduleName, standard }) })],
    flowElements: allProcFlowElements,
  });
  const plane = c('bpmndi:BPMNPlane', { id: 'BPMNPlane_' + procId, bpmnElement: proc, planeElement: [...shapes, ...edges] });
  const diagram = c('bpmndi:BPMNDiagram', { id: 'BPMNDiagram_' + procId, plane });
  const defs = c('bpmn:Definitions', {
    id: 'Definitions_' + nc(lastSeg(subdomain)),
    targetNamespace: 'http://opscale.co/bpmn',
    rootElements: [proc],
    diagrams: [diagram],
  });

  return moddle.toXML(defs, { format: true }).then(({ xml }) => ({ 'bpmn.bpmn': xml + '\n' }));
}

export default { render };
