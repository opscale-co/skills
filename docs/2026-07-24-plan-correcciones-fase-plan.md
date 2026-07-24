# Plan de correcciones — skills de la fase Plan

Origen: ejecución completa de la fase Plan (process → dbml → bpmn → sipoc) en el
módulo `Unicoop/recruitment` (001-reclutamiento), 2026-07-23/24. Cada corrección
traza a fricción real de esa corrida. El módulo sirve como **fixture de
referencia**: sus `final/*` deben pasar todos los validadores al terminar.

Prioridad: WS0–WS1 bloquean ejecuciones (drift doc↔validador); WS2–WS3 evitan
retrabajo en el siguiente módulo; WS4–WS6 endurecen; WS7–WS8 cierran.

---

## WS0 — Sincronización repo ↔ instalación (½ h) — PRIMERO

**Problema:** `~/.claude/skills/` está desincronizado del repo: `opscale-map` y
`opscale-iterate` existen en `skills/` pero no están instalados; `opscale-dbml`
referencia `/opscale-map` que el usuario no puede ejecutar.

**Acciones:**
1. Script `scripts/deploy_skills.sh` (o target en package.json): rsync
   `skills/{nombre}/` → `~/.claude/skills/{nombre}/` excluyendo `node_modules`,
   `evals/`, `__pycache__`; con `--delete` por skill para que borrados viajen.
2. Ejecutarlo y verificar: `diff -rq skills/opscale-bpmn ~/.claude/skills/opscale-bpmn`
   (y por cada skill) sin diferencias fuera de exclusiones.
3. Documentar en README: todo merge a main termina con deploy.

**Verificación:** `opscale-map` y `opscale-iterate` aparecen en la lista de
skills de una sesión nueva de Claude Code.

---

## WS1 — Drift SKILL.md ↔ validador ↔ sample (1 día) — CRÍTICO

El validador es la autoridad de facto; docs y samples deben calzarle.

### 1.1 opscale-bpmn: subProcess (el caso más grave — costó una iteración completa)
- `SKILL.md`: eliminar `subProcess` de *Allowed BPMN elements* y la instrucción
  "One subProcess per identified subprocess". Documentar el modelo real de la
  familia: **BPMN plano**; la agrupación por subproceso vive en `operations.md`
  y las esperas (`intermediateCatchEvent`) son las junturas entre fases.
- `scripts/validate-bpmn.mjs`: corregir el header y los mensajes ("only
  scriptTask and serviceTask allowed" → "only serviceTask (crud),
  businessRuleTask (logic) and sendTask (output)"); el comentario del header
  describe JSONs viejos (scriptTask crud / serviceTask operation).
- `references/bpmn-templates.md`: el skeleton usa `script_[id]` en sequenceFlows
  (resto de scriptTask) — limpiar.

### 1.2 Conteos 1:1 por ids únicos (reuso legítimo de nodos)
`discard-candidate` aparece como 3 nodos = 1 clase. Los gates por conteo de
líneas fallan siempre.
- `opscale-sipoc/SKILL.md` smoke gate: `grep -c businessRuleTask` cuenta
  aperturas+cierres y nodos reusados → reemplazar por conteo de ids únicos:
  `grep -o '"id":"[a-z-]*"' process.bpmn | sort -u | wc -l`.
- Revisar el mismo patrón en cualquier gate de opscale-logic/test.
- `validate-sipoc.mjs` ya compara por ids únicos — es el modelo a seguir.

### 1.3 opscale-process: formato de la normalización
- `SKILL.md` + `assets/spec-template.md` muestran `Canonical ← alias` en líneas;
  `validate-process.mjs` exige **tabla markdown** (≥2 filas). Actualizar template
  y SKILL a la tabla (`| Canónico | ← alias |`).

### 1.4 opscale-sipoc: sample sin "How obtained"
- `references/sample-output.md`: la tabla Inputs del ejemplo omite la columna
  `How obtained` que `validate-sipoc.mjs` exige. Añadirla.

### 1.5 opscale-dbml: bug del sample
- `references/sample-output.md`: la línea
  `Ref: applications.party_id > parties.id  // external_ref` referencia una
  tabla no declarada — @dbml/core la rechaza. Eliminar las Ref lines de
  externals del sample; las referencias externas viven SOLO como notas de
  columna.

**Verificación WS1:** correr los 4 validadores contra los `final/*` de
001-reclutamiento (fixture) → exit 0 los cuatro; layer-1 lint del pipeline
sobre los skills tocados.

---

## WS2 — Convenciones de casa como artefacto del proyecto (½ día)

**Problema:** 8+ convenciones surgieron por corrección del usuario a mitad de
fase y quedaron solo en memoria de sesión: no viajan al siguiente módulo.

**Acciones:**
1. Nuevo `skills/opscale-init/references/conventions-template.md` →
   `opscale-init` Phase 4 lo copia a `.specify/memory/conventions.md`.
   Contenido inicial (todas validadas en recruitment):
   - Columnas DBML: `id` → relaciones (FK/external_ref) → `title` →
     `description` (único, reúne todo lo descriptivo) → escalares/enums →
     `status` → timestamps.
   - Sin columnas de log `*_at`/`*_by` derivables de relaciones o de otras
     partes; entidades lean. Timestamps que son dato de negocio (plazo de una
     oferta) sí van.
   - Datos de persona SIEMPRE vía Party-Role (`external_ref:parties`); el Role
     determina condición (interno = role Employee). Nunca columnas
     nombre/correo/teléfono/documento/dirección en entidades del módulo.
   - Consentimiento/ToS no es esquema — vive en los ToS de ingreso de datos.
   - Business types obligatorios en toda columna: `ulid` solo en `id`;
     `belongs_to` en toda FK/external ref; `moment` en timestamps; `metadata`
     en json; el enum es su propio tipo (única excepción).
   - Inputs de SIPOC: NUNCA `ulid`; toda selección de entidad (incluido el
     actor de la sesión Auth) se tipa `options`.
   - Outputs que son efecto obligatorio de un Logic viven DENTRO del Logic
     (Output classes despachadas por la Action, §VI); sendTask standalone solo
     para outputs que son paso propio del negocio.
   - Logics estrictamente verbo + sustantivo, sin preposiciones
     ("Request approvals", no "Ask for approvals").
   - Todo update de status de entidad con lifecycle exige Logic (ya estaba en
     bpmn; reforzar en dbml Phase 6: no proponer columnas que lo inviten).
2. Cada skill de Plan lee `.specify/memory/conventions.md` ANTES de proponer
   (dbml Phase 6, bpmn 2.3, sipoc 2.1) y **agrega** ahí las correcciones nuevas
   del usuario al cerrarse cada fase.
3. Registry de business types del bundle:
   - Añadir slug `metadata` (json, "Flexible structured data attached to a
     record", key-value editor) a `references/business-types.md` + binding
     `business-types.php` (campo `KeyValue`, `nullable|json`, cast array) —
     ya existe en el proyecto recruitment; subirlo al canónico.
   - Reclasificar `belongs_to`: dejar de decir "UI intent only — not column
     types"; es el business type oficial de FKs/external refs.
   - Documentar `options` como tipo de input para selección de registros.

---

## WS3 — Catálogo BR con ciclo de vida (½ día)

**Problema:** las reglas se elicitan en bpmn 2.1 pero solo viven en logs;
opscale-sipoc exige BR-NN en `process.md`, que no tenía sección. En recruitment
tocó retrofit (BR-01..BR-20).

**Acciones:**
1. `opscale-process/assets/spec-template.md`: nueva sección `## Business Rules`
   (entre Ordered flow y Relations) — puede nacer con las reglas que la
   narrativa ya haga explícitas. `validate-process.mjs`: exigir la sección.
2. `opscale-bpmn` 2.1: cada regla confirmada se escribe como `BR-NN` **nuevo o
   existente** en `process.md § Business Rules` (numeración estable, append,
   nunca renumerar) — además del log. `operations.md` y los SIPOCs citan esos
   BR-NN, no numeración paralela (adiós R1..R24 efímeras).
3. `opscale-dbml`: las Key Business Rules del Project Note citan los mismos
   BR-NN del spec (una numeración, tres artefactos).

---

## WS4 — Tokens estructurales canónicos (½ día)

**Problema:** los literales que los gates parsean están dispersos; escribí
"— paso:" donde el smoke gate de sipoc esperaba `— business step:` — retrofit.

**Acciones:**
1. Nueva referencia compartida `ONTOLOGY.md § Parse tokens` (o
   `references/parse-tokens.md` por skill, generada de una fuente): headings
   SIPOC, `Stages:` / `Flows:` / `ends at`, `— business step:` /
   `— governed by:` (composition de operations.md), `external_ref:{slug}`,
   `type:{slug}`, `{"type":"logic","id":...}`, nombres/formato de los .txt
   encadenados.
2. Cada SKILL.md que emite un artefacto parseado enlaza la lista y marca los
   tokens como intocables (como ya se hace con los headings de SIPOC).
3. `opscale-bpmn`: documentar explícito que las líneas de Composition usan
   `— business step:` literal (hoy solo aparece en un ejemplo).

---

## WS5 — Cadencia oficial de gates (2 h)

**Problema:** 18 SIPOCs × 5 sub-fases = 90 gates; en la práctica funcionó
borrador-completo-por-unidad + delegación explícita.

**Acciones (los 4 SKILL.md de Plan):**
1. Política de interacción unificada: fases secuenciales, un gate por fase;
   cada gate presenta contexto → propuesta razonada → alternativas con
   trade-offs → impacto downstream → pregunta (nunca opciones sin razón).
2. En fases por-unidad (dbml Phase 6, sipoc Phase 2): cadencia oficial
   "borrador completo por unidad, un gate por unidad"; tras N unidades con
   convenciones estables, ofrecer delegación explícita ("¿autorizo el resto
   según las convenciones confirmadas?") — registrando en el log cuáles fueron
   confirmadas una a una y cuáles delegadas.

---

## WS6 — opscale-init: fixes puntuales (1 día)

1. `references/lint-staged.config.mjs` → forma de función (duster acepta UNA
   sola ruta; el array con filenames rompe todo commit con 2+ PHP staged):
   ```js
   export default { '*.{php,js,vue,ts}': () => './vendor/bin/duster fix' };
   ```
   Actualizar también `references/linting-configs.md`. (Los módulos ya
   generados — suppliers, etc. — cargan la versión rota: barrido aparte.)
2. `phpstan.neon`: crear `references/phpstan.neon` standalone (el SKILL manda
   copiarlo y no existe) SIN `checkMissingIterableValueType` ni
   `checkGenericClassInNonGenericObjectType` (eliminados en PHPStan 2 /
   Larastan 3); incluir el ignore de `*ServiceProvider.php` que usa la familia.
3. Crear `references/.releaserc.json` y `references/.eslintrc.cjs` — el SKILL
   ordena `cp references/...` de archivos que no existen (se rescataron de
   suppliers a mano).
4. **Nuevo paso 4e — arnés de pruebas base**: phpunit.xml + phpunit.dusk.xml
   (suites Unit/Feature/Browser, sqlite :memory:, APP_KEY compartida con
   testbench.yaml), tests/TestCase.php (providers Nova/Inertia/Fortify/Actions
   + SubdomainServiceProvider), tests/DuskTestCase.php (WithWorkbench, puerto
   base único por módulo), tests/Pest.php, smoke test del provider, workbench
   mínimo (User, WorkbenchServiceProvider, NovaServiceProvider, DatabaseSeeder,
   .env). Criterio de éxito del init: `composer run test` en verde, no solo
   scaffold. (Gap que el usuario detectó: "testbench no está configurado".)
5. Documentar política de dependencias: constraints de UNA versión (caret a la
   última posible según el tope real del árbol — Nova 5 / nova-package-tools
   topan illuminate en ^12), nunca `||` ni `*`; y `COMPOSER_MEMORY_LIMIT=-1`
   para el update inicial (el solver revienta 1.5G con constraints sueltos).
6. Unificar el paquete rector-laravel (`references/linting-configs.md` dice
   `rector/rector-laravel`; verificar contra lo que la familia instala).

---

## WS7 — opscale-map: deploy + contrato de formato (2 h)

1. Se instala vía WS0 (ya existe en el repo).
2. Verificar que su output (`.specify/memory/domain-map.md`) produce las tablas
   **Domains** y **Cross-module references** que `opscale-dbml` consume, con
   slugs → dueño real. Usar como fixture el domain-map manual de recruitment
   (validado en uso: resolvió parties/users/employees/departments/cost_centers).
3. Añadir al SKILL de map la obligación de re-emitir el mapa cuando un módulo
   declara slugs nuevos (hoy la instrucción existe solo del lado de dbml).

---

## WS8 — Validación del conjunto (½ día)

1. Copiar los `final/*` de 001-reclutamiento como fixtures de evals
   (`skills/opscale-*/evals/fixtures/recruitment/`).
2. Correr el pipeline del repo sobre los skills tocados: layer 1 (lint) →
   layer 2 (trigger evals) → layer 3 (functional evals, runs=3, threshold 0.8)
   → improve loop si no converge.
3. Deploy final (WS0) + smoke: sesión nueva ejecutando opscale-process en un
   módulo dummy hasta el primer gate de cada skill.

---

## Secuencia de commits sugerida

```
fix(bpmn): align SKILL and validator on flat BPMN, drop subProcess          [WS1.1]
fix(gates): count logic units by unique ids, support node reuse             [WS1.2]
fix(process): normalization table format in template matches validator      [WS1.3]
fix(sipoc): sample includes How obtained column                             [WS1.4]
fix(dbml): drop invalid external Ref lines from sample                      [WS1.5]
feat(conventions): project conventions artifact read by all Plan skills     [WS2]
feat(business-types): metadata slug; belongs_to as column type; options     [WS2.3]
feat(process,bpmn): Business Rules catalog with stable BR-NN lifecycle      [WS3]
docs(ontology): canonical parse-tokens reference                            [WS4]
docs(plan-skills): official gate cadence and reasoning policy               [WS5]
fix(init): lint-staged function form, phpstan 2 params, missing references  [WS6.1-3]
feat(init): base test harness so composer test passes from day one          [WS6.4]
docs(init): dependency pinning policy and composer solver memory            [WS6.5]
feat(pipeline): recruitment fixtures for Plan-skill evals                   [WS8]
chore(deploy): skills sync script repo → ~/.claude/skills                   [WS0]
```

Estimación total: ~3.5 días de trabajo efectivo. WS0+WS1 dan el 60% del valor.
