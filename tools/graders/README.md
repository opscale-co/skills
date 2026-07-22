# Pluggable graders

A grader is any executable that checks one assertion about an eval run.
This directory is where skill-specific graders live; the runner knows only
the contract below, never the language or framework being graded.

Contract:
- invoked as:  <cmd> <output_dir>   (output_dir = the tmpdir copy of the
  fixture after the agent ran; referenced from functional.json as
  `{"type": "script", "cmd": "python3 tools/graders/<name>.py {output_dir}"}`)
- exit code 0 = assertion passed, non-zero = failed
- stdout: one human-readable message explaining the verdict

Anything a tool can verify belongs here or in a config `verify` command —
`llm` assertions are a last resort for genuinely subjective criteria.
