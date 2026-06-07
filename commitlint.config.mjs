// Commit convention for the opscale-skills repo.
// Scope is free-form kebab-case so we can scope by skill name (opscale-init,
// opscale-process, ...), by tooling area (scripts, husky, release, lint), or
// by agent (agents/<name>) without maintaining an enum that goes stale.
export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [2, 'always', [
            'feat', 'fix', 'docs', 'style', 'refactor',
            'perf', 'test', 'chore', 'revert', 'build', 'ci',
        ]],
        'scope-case': [2, 'always', 'kebab-case'],
        'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
        'subject-max-length': [2, 'always', 100],
        'body-max-line-length': [2, 'always', 200],
    },
};
