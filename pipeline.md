Quiero construir un pipeline reproducible para crear y validar skills de Claude Code. Hoy las escribo y las pruebo a mano; quiero automatizar la validación y poder iterar sobre ellas sin revisar cada corrida.

**Requisito transversal: el pipeline debe funcionar para cualquier skill, no solo para las mías.** Descubre las skills automáticamente recorriendo `skills/`. Nada específico de un lenguaje, framework o herramienta puede vivir dentro de `tools/` — todo eso va en configuración, en los evals o en graders enchufables. Si te encuentras escribiendo un `if` sobre un lenguaje concreto dentro de `tools/`, eso es señal de que pertenece a la config.

Antes de escribir nada, **lee el `skill-creator`** en `/mnt/skills/examples/skill-creator/` (o el equivalente instalado). Trae `quick_validate.py`, `run_eval.py`, `run_loop.py`, `aggregate_benchmark.py` y `package_skill.py`. Reutiliza lo que sirva en vez de reimplementarlo, y arranca diciéndome explícitamente qué reutilizas y qué construyes de cero.

## Estructura objetivo

```
skills-monorepo/
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── scripts/
│       ├── references/
│       └── evals/
│           ├── trigger.json
│           ├── functional.json
│           └── fixtures/
├── tools/
│   ├── lint_skills.py
│   ├── run_functional_evals.py
│   ├── improve_loop.py
│   └── graders/
├── skills.config.yml
├── .github/workflows/skills.yml
└── README.md
```

`skills.config.yml` es el único punto de acoplamiento entre el pipeline y un stack concreto:

```yaml
defaults:
  runs: 3
  threshold: 0.8
  max_iter: 5
  token_budget: <tope por loop>
compilers:            # verificadores de sintaxis por extensión, para la capa 1
  ".py": "python -m py_compile"
  ".sh": "bash -n"
  ".php": "php -l"
skills:
  opscale-domain:
    languages: [php]
    fixture: <RUTA AL PROYECTO ESQUELETO QUE YA EXISTE EN EL REPO>
    verify:
      - {id: types, cmd: "vendor/bin/phpstan analyse --level=8"}
      - {id: tests, cmd: "vendor/bin/pest"}
      - {id: style, cmd: "vendor/bin/pint --test"}
```

## Capa 1 — Linter estático (`tools/lint_skills.py`)

Determinista, sin LLM, corre en segundos sobre todo `skills/`. Salida legible y `--json` para CI. Exit code ≠ 0 solo con errores; los warnings no rompen el build.

Errores:
- Frontmatter YAML válido con `name` y `description`.
- `name` en kebab-case, coincidente con el nombre del directorio.
- `description` entre 50 y 500 caracteres.
- Todo path referenciado en `SKILL.md` existe en el bundle.
- Los scripts de `scripts/` compilan. Despacha el verificador por extensión leyendo el mapa `compilers` de la config. Extensión sin verificador registrado → warning, no error.
- Sin secretos embebidos (patrones de API key, token, password, claves privadas).

Warnings:
- `SKILL.md` sobre 500 líneas → sugerir mover contenido a `references/`.
- Más de 5 apariciones de `ALWAYS`/`NEVER`/`MUST` en mayúsculas → instrucciones rígidas en vez de explicar el porqué.
- Archivos de `references/` sobre 300 líneas sin tabla de contenidos.
- Posible overfitting: identificadores, rutas o nombres propios presentes tanto en `evals/` como en `SKILL.md`. Reporta cuál y en qué línea de cada archivo.

Escribe tests del linter con fixtures de skills válidas e inválidas.

## Capa 2 — Evals de triggering

Reutiliza `run_eval.py` / `run_loop.py`. Lo que hay que producir es el eval set por skill: `evals/trigger.json`, 20 queries.

```json
[{"query": "...", "should_trigger": true}, {"query": "...", "should_trigger": false}]
```

8–10 positivas con formulaciones variadas de la misma intención, formales y casuales, incluyendo casos donde no se nombra la skill ni el tipo de archivo. 8–10 negativas que sean **near-misses**: comparten vocabulario y dominio con la skill pero necesitan otra cosa. Una negativa obviamente irrelevante no prueba nada.

Las queries deben ser realistas: rutas concretas, nombres de entidades, contexto de trabajo, minúsculas y typos ocasionales. Nada de "formatea estos datos".

**Preséntame el eval set para revisión antes de correrlo.**

## Capa 3 — Evals funcionales (`tools/run_functional_evals.py`)

La parte nueva y la más importante. `evals/functional.json`:

```json
{
  "skill_name": "<skill>",
  "evals": [
    {
      "id": "<nombre-descriptivo-del-caso>",
      "prompt": "...",
      "assertions": [
        {"id": "types", "type": "verify", "ref": "types"},
        {"id": "<regla-propia>", "type": "script", "cmd": "python tools/graders/<grader>.py {output_dir}"},
        {"id": "<criterio-subjetivo>", "type": "llm", "text": "<qué debe cumplirse>"}
      ]
    }
  ]
}
```

- `type: verify` referencia por id un comando del bloque `verify` de la config — así el eval no repite comandos del toolchain.
- `type: script` ejecuta un grader propio de `tools/graders/`. Contrato: recibe el directorio de output, devuelve exit code 0/1 y un mensaje en stdout. Ese contrato es lo único que el runner necesita conocer.
- **Prioriza `verify` y `script` sobre `llm`.** Lo que se pueda verificar con un exit code es determinista, cuesta cero tokens y es reusable entre iteraciones. `llm` es último recurso, solo para lo genuinamente subjetivo.
- Cada eval corre contra una copia del fixture en un tmpdir, nunca contra el repo real. Los fixtures deben ser autocontenidos, sin servicios externos ni red.
- **Corre cada eval `runs` veces** y calcula tasa de aprobación, no pass/fail binario. Los agentes no son deterministas; una sola corrida no es señal.
- **Corre siempre un baseline sin la skill**, mismo prompt, y reporta el delta. Delta cero significa que la skill gasta contexto sin aportar.
- Registra tokens y duración por corrida.

Salida: `benchmark.json` por iteración con tasa de aprobación, media ± desviación estándar, tiempo y tokens, por configuración y desglosado por eval. Usa `aggregate_benchmark.py` si el esquema calza.

## Capa 4 — Loop de mejora (`tools/improve_loop.py`)

Loop cerrado que reescribe la skill hasta converger. Las condiciones de corte no son opcionales.

```
split del eval set: 60% train / 40% test — el loop NUNCA ve el test set
best = snapshot(skill)

for i in 1..max_iter:
    score_train = run_evals(skill, train, runs)
    score_test  = run_evals(skill, test,  runs)

    if score_train >= threshold and score_test >= threshold:
        stop("convergió")

    if score_test <= best.score_test:
        strikes += 1
        if strikes >= 2:
            rollback(best); stop("estancado")
    else:
        best = snapshot(skill); strikes = 0

    skill = revise(skill, failures=failing_cases(train))
```

- `token_budget` es condición de corte independiente de las iteraciones: aborta y reporta si se excede.
- **La versión ganadora se elige por score de test, no de train.** Es lo único que evita converger a una skill que solo pasa mis ejemplos.
- Snapshot de cada iteración en `<skill>-workspace/iteration-N/` para comparar y hacer rollback.
- Reporte final: score por iteración, qué cambió en cada revisión, diff entre versión inicial y ganadora.
- La instrucción al modelo revisor debe empujar a **generalizar** desde los fallos, no a parchear el caso específico, y a explicar el porqué de cada instrucción en vez de agregar imperativos en mayúsculas.

## CI (`.github/workflows/skills.yml`)

- `lint`: en cada push, sobre todo `skills/`.
- `eval`: solo para las skills modificadas en el commit, detectadas por path. Matrix por skill. Umbrales desde `skills.config.yml`.
- `package`: solo en la rama principal y solo si `eval` pasó. Los `.skill` como artifacts.

Las capas 2 y 3 consumen API: no las corras sin filtro de path.

## Restricciones

- No inventes un framework de evals nuevo si el del skill-creator sirve.
- Nada acoplado a un lenguaje o herramienta dentro de `tools/`.
- Nada de assertions `llm` para lo que una herramienta puede verificar.
- `package_skill.py` no debe incluir `evals/` ni fixtures en el bundle empaquetado.

## Orden de entrega

Entrégalo por fases y **para en cada una** para que yo revise antes de seguir:

1. Reporte de lectura del skill-creator (qué reutilizas, qué construyes). Estructura del repo, `skills.config.yml` y `lint_skills.py` con sus tests. Corre el linter sobre todas las skills existentes y muéstrame los hallazgos.
2. `run_functional_evals.py` + `functional.json` completo **solo para `opscale-domain`**, usando el fixture que ya existe en el repo. Corrida real con baseline y reporte de resultados.
3. Eval sets de triggering para el resto de skills, presentados para mi revisión.
4. `improve_loop.py`, probado sobre `opscale-domain`.
5. Workflow de CI y documentación.