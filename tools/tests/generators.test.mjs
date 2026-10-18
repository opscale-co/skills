// Regression tests for the Generate-phase generators (opscale-domain, opscale-logic,
// opscale-ui). Each test renders one class into a scratch directory and asserts the
// emitted PHP. Run: node --test tools/tests/generators.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NS = 'Acme\\Shop';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'opscale-gen-'));
  mkdirSync(join(dir, 'lang'), { recursive: true });
  writeFileSync(join(dir, 'lang', 'en.json'), '{}');
  writeFileSync(join(dir, 'lang', 'es.json'), '{}');
  return dir;
}

// Runs a generator with the given input (paths relative to `dir`) and returns stdout.
function run(script, input, dir) {
  const inputPath = join(dir, 'input.json');
  writeFileSync(inputPath, JSON.stringify(input));
  return execFileSync('node', [join(ROOT, 'skills', script), '--input', inputPath], { cwd: dir, encoding: 'utf8' });
}

function runFails(script, input, dir) {
  try {
    run(script, input, dir);
  } catch (error) {
    return String(error.stderr);
  }
  assert.fail(`${script} was expected to fail`);
}

// --- opscale-domain ----------------------------------------------------------

test('domain: migration places enum columns after the authored rest, like the model', () => {
  const dir = scratch();
  run('opscale-domain/scripts/generate-migration.mjs', {
    table_name: 'order', output_dir: join(dir, 'database/migrations'), timestamp: '2026_01_01_000001', module_prefix: 'shop',
    columns: [
      { name: 'kind', type: 'enum', default: 'Retail' },
      { name: 'code', type: 'string', length: 20 },
      { name: 'placed_on', type: 'date' },
    ],
    foreign_keys: [], indexes: [],
  }, dir);
  const php = readFileSync(join(dir, 'database/migrations/2026_01_01_000001_create_shop_order_table.php'), 'utf8');
  assert.ok(php.indexOf("'code'") < php.indexOf("'kind'"), 'enum column must follow the authored rest');
  assert.ok(php.indexOf("'kind'") < php.indexOf("'placed_on'"), 'date column must follow the enum');
});

test('domain: enums expose label() returning the Title Case value', () => {
  const dir = scratch();
  run('opscale-domain/scripts/generate-enum.mjs', {
    enum_name: 'OrderKind', package_namespace: NS, output_dir: join(dir, 'src/Models/Enums'),
    cases: [{ name: 'retail', meaning: 'Shop sale.' }, { name: 'wholesale', meaning: 'Bulk sale.' }],
  }, dir);
  const php = readFileSync(join(dir, 'src/Models/Enums/OrderKind.php'), 'utf8');
  assert.match(php, /public function label\(\): string\s*\{\s*return \$this->value;\s*\}/);
});

test('domain: repository imports the enums its scopes reference', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'src/Models/Enums'), { recursive: true });
  writeFileSync(join(dir, 'src/Models/Enums/OrderKind.php'), '<?php');
  run('opscale-domain/scripts/generate-repository.mjs', {
    model_name: 'Order', package_namespace: NS, output_dir: join(dir, 'src/Models/Repositories'),
    scopes: [{ name: 'OfKind', params: [{ name: 'kind', type: 'OrderKind' }], body: "return $query->where('kind', $kind->value);" }],
  }, dir);
  const php = readFileSync(join(dir, 'src/Models/Repositories/OrderRepository.php'), 'utf8');
  assert.match(php, /use Acme\\Shop\\Models\\Enums\\OrderKind;/);
});

test('domain: repository keeps importing only the status enum when scopes reference nothing else', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'src/Models/Enums'), { recursive: true });
  writeFileSync(join(dir, 'src/Models/Enums/OrderStatus.php'), '<?php');
  run('opscale-domain/scripts/generate-repository.mjs', {
    model_name: 'Order', package_namespace: NS, output_dir: join(dir, 'src/Models/Repositories'),
    has_status: true, status_enum: 'OrderStatus',
    scopes: [{ name: 'Open', params: [], body: "return $query->where('status', OrderStatus::Open->value);" }],
  }, dir);
  const php = readFileSync(join(dir, 'src/Models/Repositories/OrderRepository.php'), 'utf8');
  assert.equal(php.match(/use Acme\\Shop\\Models\\Enums\\OrderStatus;/g)?.length, 1);
});

test('domain: contracts declare forSelect() for the Nova Select the UI layer renders', () => {
  const dir = scratch();
  run('opscale-domain/scripts/generate-contract.mjs', {
    contract_slug: 'suppliers', package_namespace: NS, contracts_dir: join(dir, 'src/Contracts'), concerns_dir: join(dir, 'src/Models/Concerns'),
  }, dir);
  const php = readFileSync(join(dir, 'src/Contracts/SuppliersContract.php'), 'utf8');
  assert.match(php, /public function options\(\): array;/);
  assert.match(php, /public function forSelect\(\): array;/);
});

// --- opscale-ui ----------------------------------------------------------------

function resourceInput(dir, overrides = {}) {
  return {
    model_name: 'Order', package_namespace: NS, output_dir: join(dir, 'src/Nova'), title_column: 'code', search_columns: ['code'],
    uri_key: 'shop-orders', label: 'shop.order.label', label_en: 'Orders', label_es: 'Pedidos',
    singular_label: 'shop.order.singular', singular_label_en: 'Order', singular_label_es: 'Pedido',
    fields: [{ field: 'Text', attribute: 'code', label: 'shop.order.code', label_en: 'Code', label_es: 'Código', on_index: true }],
    ...overrides,
  };
}

function renderResource(overrides = {}) {
  const dir = scratch();
  run('opscale-ui/scripts/generate-resource.mjs', resourceInput(dir, overrides), dir);
  return { dir, php: readFileSync(join(dir, 'src/Nova/Order.php'), 'utf8') };
}

test('ui: enum Selects label each option with the enum label(), not the PHP case name', () => {
  const { php } = renderResource({ fields: [
    { field: 'Select', attribute: 'kind', label: 'shop.order.kind', label_en: 'Kind', label_es: 'Tipo', enum_class: 'OrderKind' },
  ] });
  assert.match(php, /\$case->value => __\(\$case->label\(\)\)/);
  assert.doesNotMatch(php, /__\(\$case->name\)/);
});

test('ui: a Select can take its options from a PHP expression (configurable catalogs)', () => {
  const { php } = renderResource({ fields: [
    { field: 'Select', attribute: 'bank', label: 'shop.order.bank', label_en: 'Bank', label_es: 'Banco', options_expr: "Catalog::options('bank')" },
  ] });
  assert.match(php, /Select::make\(__\('shop\.order\.bank'\), 'bank'\)\s*->options\(Catalog::options\('bank'\)\)/);
});

test('ui: a Select without enum_class or options_expr is still rejected', () => {
  const dir = scratch();
  const err = runFails('opscale-ui/scripts/generate-resource.mjs', resourceInput(dir, { fields: [
    { field: 'Select', attribute: 'bank', label: 'shop.order.bank', label_en: 'Bank', label_es: 'Banco' },
  ] }), dir);
  assert.match(err, /enum_class or options_expr/);
});

test('ui: system-only relation tabs are filtered out when empty, since Nova 5 Tab has no canSee()', () => {
  const { php } = renderResource({
    has_many_relationships: [
      { name: 'lines', label: 'shop.order.tab.lines', label_en: 'Lines', label_es: 'Líneas', related_resource: 'Line', creatable_from_ui: true },
      { name: 'payments', label: 'shop.order.tab.payments', label_en: 'Payments', label_es: 'Pagos', related_resource: 'Payment', creatable_from_ui: false },
    ],
  });
  assert.doesNotMatch(php, /\)->canSee\(fn \(\) => \(\$this->resource->\w+_count/);
  assert.match(php, /Tab::group\(__\('shop\.order\.label'\), array_filter\(\[/);
  assert.match(php, /\$this->resource->payments\(\)->exists\(\) \? Tab::make\(__\('shop\.order\.tab\.payments'\)/);
  assert.match(php, /\n {16}Tab::make\(__\('shop\.order\.tab\.lines'\)/);
});

test('ui: a resource whose tabs are all creatable keeps a plain tab group', () => {
  const { php } = renderResource({
    has_many_relationships: [{ name: 'lines', label: 'shop.order.tab.lines', label_en: 'Lines', label_es: 'Líneas', related_resource: 'Line', creatable_from_ui: true }],
  });
  assert.match(php, /Tab::group\(__\('shop\.order\.label'\), \[/);
  assert.doesNotMatch(php, /array_filter/);
});

test('ui: status badge labels get per-resource keys so each resource keeps its own wording', () => {
  const { dir, php } = renderResource({
    has_status: true, status_enum: 'OrderStatus',
    status_badge: { map: [{ case: 'Approved', color: 'success' }], labels: [{ case: 'Approved', label_en: 'Approved', label_es: 'Aprobada' }] },
  });
  assert.match(php, /OrderStatus::Approved->value => __\('shop\.order\.status\.approved'\)/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'lang/es.json'), 'utf8'))['shop.order.status.approved'], 'Aprobada');
  assert.equal(JSON.parse(readFileSync(join(dir, 'lang/en.json'), 'utf8'))['shop.order.status.approved'], 'Approved');
});

test('ui: an explicit status badge label key is kept', () => {
  const { php } = renderResource({
    has_status: true, status_enum: 'OrderStatus',
    status_badge: { map: [{ case: 'Approved', color: 'success' }], labels: [{ case: 'Approved', label: 'shop.status.approved', label_en: 'Approved', label_es: 'Aprobado' }] },
  });
  assert.match(php, /__\('shop\.status\.approved'\)/);
});

test('ui: actions are registered through make() and import ActionRequest when a guard uses it', () => {
  const { php } = renderResource({
    has_status: true, status_enum: 'OrderStatus', status_badge: { map: [], labels: [] },
    actions: [{ action_class: 'ShipOrder', can_see_expr: '$request instanceof ActionRequest || $this->resource->status === OrderStatus::Paid' }],
  });
  assert.match(php, /ShipOrder::make\(\)\s*->canSee/);
  assert.doesNotMatch(php, /\(new ShipOrder\)/);
  assert.match(php, /use Laravel\\Nova\\Http\\Requests\\ActionRequest;/);
});

test('ui: indexQuery documents its builder and overrides the parent', () => {
  const { php } = renderResource({
    count_strategy: 'index',
    has_many_relationships: [{ name: 'lines', label: 'shop.order.tab.lines', label_en: 'Lines', label_es: 'Líneas', related_resource: 'Line', creatable_from_ui: true }],
  });
  assert.match(php, /@param\s+\\Illuminate\\Contracts\\Database\\Eloquent\\Builder\s+\$query[\s\S]*#\[\\Override\]\s*public static function indexQuery/);
});

// --- opscale-logic -------------------------------------------------------------

function actionInput(dir, overrides = {}) {
  return {
    action_class_name: 'ShipOrder', prefix: 'shop', identifier: 'ship-order', name: 'Ship order', description: 'Ships a paid order.',
    package_namespace: NS, output_dir: join(dir, 'src/Services/Actions'), lang_dir: join(dir, 'lang'),
    parameters: [{ name: 'order_id', description: 'Order to ship.', type: 'Order', rules: ['required'] }],
    entities: ['Order'], entity_param: 'order_id',
    outputs: [{ name: 'status', description: 'New status.', type: 'string', rules: ['required', 'string'] }],
    handle_body: "return $this->succeed(['status' => 'Shipped']);",
    ...overrides,
  };
}

function renderAction(overrides = {}) {
  const dir = scratch();
  run('opscale-logic/scripts/generate-action.mjs', actionInput(dir, overrides), dir);
  return readFileSync(join(dir, 'src/Services/Actions/ShipOrder.php'), 'utf8');
}

test('logic: extra_imports adds the classes a body uses beyond the models', () => {
  const php = renderAction({ extra_imports: ['Illuminate\\Support\\Facades\\DB', 'Acme\\Shop\\Contracts\\CarriersContract'] });
  assert.match(php, /use Illuminate\\Support\\Facades\\DB;/);
  assert.match(php, /use Acme\\Shop\\Contracts\\CarriersContract;/);
});

test('logic: an exists: rule on the prefilled entity parameter is rejected (Nova passes the model instance)', () => {
  const dir = scratch();
  const err = runFails('opscale-logic/scripts/generate-action.mjs', actionInput(dir, {
    parameters: [{ name: 'order_id', description: 'Order to ship.', type: 'Order', rules: ['required', 'exists:shop_order,id'] }],
  }), dir);
  assert.match(err, /entity_param 'order_id'.*exists:/);
});

test('logic: an array parameter is decoded from the JSON string Nova MultiSelect submits', () => {
  const php = renderAction({
    parameters: [
      { name: 'order_id', description: 'Order to ship.', type: 'Order', rules: ['required'] },
      { name: 'carrier_ids', description: 'Carriers to notify.', type: 'array', rules: ['required'], requires_options: true },
    ],
    options_entries: [{ param: 'carrier_ids', php_expr: "['dhl' => 'DHL']" }],
  });
  assert.match(php, /public function fill\(array \$attributes\): static/);
  assert.match(php, /is_string\(\$attributes\['carrier_ids'\] \?\? null\)/);
  assert.match(php, /json_decode\(\$attributes\['carrier_ids'\], true\)/);
});

test('logic: an array rule on an array parameter is rejected, since Nova validates the JSON string', () => {
  const dir = scratch();
  const err = runFails('opscale-logic/scripts/generate-action.mjs', actionInput(dir, {
    parameters: [
      { name: 'order_id', description: 'Order to ship.', type: 'Order', rules: ['required'] },
      { name: 'carrier_ids', description: 'Carriers to notify.', type: 'array', rules: ['required', 'array'], requires_options: true },
    ],
    options_entries: [{ param: 'carrier_ids', php_expr: "['dhl' => 'DHL']" }],
  }), dir);
  assert.match(err, /carrier_ids.*'array' rule/);
});

test('logic: an action without array parameters gets no fill() override', () => {
  assert.doesNotMatch(renderAction(), /function fill\(/);
});
