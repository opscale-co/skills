#!/usr/bin/env python3
"""Tests for tools/lint_skills.py against the fixture skills in fixtures/.

Run with:  python3 -m unittest discover tools/tests
Stdlib only (unittest), like the linter itself.
"""
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import lint_skills  # noqa: E402
import pipeline_config  # noqa: E402

FIXTURES = os.path.join(HERE, "fixtures")
COMPILERS = {".py": f"{sys.executable} -m py_compile", ".sh": "bash -n"}


def run_lint(fixture_name, compilers=COMPILERS):
    return lint_skills.lint_skill(os.path.join(FIXTURES, fixture_name), compilers)


def levels(findings, check):
    return [f for f in findings if f["check"] == check]


class LintFixtureTests(unittest.TestCase):
    def test_valid_skill_has_no_errors(self):
        findings = run_lint("valid-skill")
        errors = [f for f in findings if f["level"] == "error"]
        self.assertEqual(errors, [], f"valid-skill should be clean, got: {errors}")

    def test_missing_description_is_error(self):
        findings = run_lint("bad-frontmatter")
        self.assertTrue(any(f["level"] == "error" and "description" in f["message"]
                            for f in levels(findings, "frontmatter")))

    def test_name_directory_mismatch_is_error(self):
        findings = run_lint("name-mismatch")
        self.assertTrue(any(f["level"] == "error" and "directory" in f["message"]
                            for f in levels(findings, "name")))

    def test_referenced_path_must_exist(self):
        findings = run_lint("missing-path")
        hits = levels(findings, "missing-path")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["level"], "error")
        self.assertIn("references/does-not-exist.md", hits[0]["message"])
        self.assertIsNotNone(hits[0]["line"])

    def test_embedded_secrets_are_errors(self):
        findings = run_lint("has-secret")
        hits = levels(findings, "secret")
        self.assertTrue(any("aws-access-key" in f["message"] for f in hits))
        self.assertTrue(any("credential-assignment" in f["message"] for f in hits))
        self.assertTrue(all(f["level"] == "error" for f in hits))

    def test_non_compiling_script_is_error(self):
        findings = run_lint("broken-script")
        hits = [f for f in levels(findings, "compile") if f["level"] == "error"]
        self.assertEqual(len(hits), 1)
        self.assertIn("scripts/broken.py", hits[0]["file"])

    def test_unregistered_extension_is_warning_not_error(self):
        findings = run_lint("broken-script", compilers={})
        hits = levels(findings, "compile")
        self.assertTrue(hits)
        self.assertTrue(all(f["level"] == "warning" for f in hits))

    def test_overfit_identifier_shared_with_evals_is_warning(self):
        findings = run_lint("overfit-skill")
        hits = levels(findings, "overfit")
        self.assertEqual(len(hits), 1)
        self.assertIn("InvoiceReconciliation", hits[0]["message"])
        self.assertEqual(hits[0]["level"], "warning")

    def test_valid_skill_has_no_overfit_warning(self):
        self.assertEqual(levels(run_lint("valid-skill"), "overfit"), [])


class LintGeneratedFixtureTests(unittest.TestCase):
    """Warnings that need bulk content are generated on the fly."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="lint-fixture-")
        self.addCleanup(shutil.rmtree, self.tmp)

    def make_skill(self, name, body, description=None, extra_files=None):
        skill_dir = os.path.join(self.tmp, name)
        os.makedirs(skill_dir)
        desc = description or ("A generated fixture skill used to exercise one "
                               "specific lint warning in isolation.")
        with open(os.path.join(skill_dir, "SKILL.md"), "w") as f:
            f.write(f"---\nname: {name}\ndescription: {desc}\n---\n\n{body}\n")
        for rel, content in (extra_files or {}).items():
            path = os.path.join(skill_dir, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as fh:
                fh.write(content)
        return skill_dir

    def test_skill_md_over_500_lines_is_warning(self):
        skill = self.make_skill("long-skill", "line\n" * 600)
        hits = levels(lint_skills.lint_skill(skill, {}), "size")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["level"], "warning")

    def test_imperative_density_is_warning(self):
        body = "You MUST do this. NEVER do that. ALWAYS check. " * 3
        skill = self.make_skill("shouty-skill", body)
        hits = levels(lint_skills.lint_skill(skill, {}), "imperatives")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["level"], "warning")

    def test_long_reference_without_toc_is_warning(self):
        skill = self.make_skill(
            "big-ref-skill", "See references/big.md.",
            extra_files={"references/big.md": "content line\n" * 400},
        )
        hits = levels(lint_skills.lint_skill(skill, {}), "reference-toc")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["level"], "warning")

    def test_long_reference_with_toc_is_clean(self):
        toc = "# Contents\n" + "- [s](#s)\n" * 4
        skill = self.make_skill(
            "toc-ref-skill", "See references/big.md.",
            extra_files={"references/big.md": toc + "content line\n" * 400},
        )
        self.assertEqual(levels(lint_skills.lint_skill(skill, {}), "reference-toc"), [])

    def test_description_length_bounds(self):
        skill = self.make_skill("tiny-desc", "Body.", description="Too short.")
        hits = levels(lint_skills.lint_skill(skill, {}), "description")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]["level"], "error")


class ConfigParserTests(unittest.TestCase):
    def test_parses_repo_config_shape(self):
        text = (
            "defaults:\n"
            "  runs: 3\n"
            "  threshold: 0.8\n"
            "compilers:\n"
            "  \".py\": \"python3 -m py_compile\"\n"
            "skills:\n"
            "  opscale-domain:\n"
            "    languages: [php]\n"
            "    verify:\n"
            "      - {id: types, cmd: \"vendor/bin/phpstan analyse --level=8\"}\n"
            "      - id: tests\n"
            "        cmd: \"vendor/bin/pest\"\n"
        )
        data = pipeline_config.parse_yaml_subset(text)
        self.assertEqual(data["defaults"]["runs"], 3)
        self.assertEqual(data["defaults"]["threshold"], 0.8)
        self.assertEqual(data["compilers"][".py"], "python3 -m py_compile")
        skill = data["skills"]["opscale-domain"]
        self.assertEqual(skill["languages"], ["php"])
        self.assertEqual(skill["verify"][0], {"id": "types", "cmd": "vendor/bin/phpstan analyse --level=8"})
        self.assertEqual(skill["verify"][1], {"id": "tests", "cmd": "vendor/bin/pest"})

    def test_real_config_loads_and_merges(self):
        cfg = pipeline_config.load_config()
        self.assertIn(".py", cfg["compilers"])
        eff = pipeline_config.skill_settings(cfg, "opscale-domain")
        self.assertEqual(eff["runs"], 3)
        self.assertTrue(any(v["id"] == "style" for v in eff["verify"]))
        self.assertTrue(all(set(v) == {"id", "cmd"} for v in eff["verify"]))

    def test_comments_and_blanks_ignored(self):
        data = pipeline_config.parse_yaml_subset("# top\nkey: value  # trailing\n\nother: 2\n")
        self.assertEqual(data, {"key": "value", "other": 2})


if __name__ == "__main__":
    unittest.main()
