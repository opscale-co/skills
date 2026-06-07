export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [2, 'always', [
            'feat', 'fix', 'docs', 'style', 'refactor',
            'perf', 'test', 'chore', 'revert', 'build', 'ci'
        ]],
        'scope-case': [2, 'always', 'kebab-case'],
        'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
        'subject-max-length': [2, 'always', 100],
        'body-max-line-length': [2, 'always', 200],
    },
};
