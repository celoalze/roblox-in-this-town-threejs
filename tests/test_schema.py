"""Plain-Python checks for the story authoring schema."""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.story.schema import unknown_keys, validate


def base_story():
    """Return a small structurally valid story for negative cases."""
    return {
        "title": "Schema check",
        "genre": "in_this_town",
        "cast": ["milo"],
        "scenes": [{"line": "A small test line."}],
    }


def negative_cases():
    """Build malformed stories and the JSON path each must report."""
    return [
        ([], "$"),
        ({}, "$.scenes"),
        ({"scenes": "one scene"}, "$.scenes"),
        ({"scenes": [7]}, "$.scenes[0]"),
        ({"cast": "milo", "scenes": []}, "$.cast"),
        ({"genre": "unknown_genre", "scenes": []}, "$.genre"),
        ({"scenes": [{"line": 17}]}, "$.scenes[0].line"),
        ({"scenes": [{"dur": -1}]}, "$.scenes[0].dur"),
        ({"scenes": [{"cam": 12}]}, "$.scenes[0].cam"),
        ({"scenes": [{"shots": "close"}]}, "$.scenes[0].shots"),
        ({"scenes": [{"actors": [2]}]}, "$.scenes[0].actors[0]"),
        ({"scenes": [{"crowd": False}]}, "$.scenes[0].crowd"),
        ({"scenes": [{"props": {"type": "trophy"}}]}, "$.scenes[0].props"),
        ({"scenes": [{"sfx": 1}]}, "$.scenes[0].sfx"),
        ({"scenes": [{"transition": "spin"}]}, "$.scenes[0].transition"),
        ({"motion": "unknown_motion", "scenes": []}, "$.motion"),
        ({"motion": {"intensity": 5}, "scenes": []}, "$.motion.intensity"),
        ({"scenes": [{"motion": True}]}, "$.scenes[0].motion"),
    ]


def main():
    """Validate every checked-in story and representative malformed shapes."""
    failures = []
    files = sorted(ROOT.glob("stories/*/story.json"))
    files += sorted(ROOT.glob("tests/stories/*/story.json"))
    for path in files:
        try:
            story = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            failures.append(f"{path.relative_to(ROOT)}: could not load JSON: {exc}")
            continue
        errors = validate(story)
        if errors:
            failures.extend(f"{path.relative_to(ROOT)}: {error}" for error in errors)
    cases = negative_cases()
    for index, (story, expected_path) in enumerate(cases, start=1):
        errors = validate(story)
        if not errors:
            failures.append(f"negative case {index}: expected an error at {expected_path}")
        elif not any(expected_path in error for error in errors):
            failures.append(f"negative case {index}: expected {expected_path}, got {errors}")
    typo = base_story()
    typo["scenes"][0]["actor"] = "milo"
    warnings = unknown_keys(typo)
    if not any("scenes[0].actor" in warning and "actors" in warning for warning in warnings):
        failures.append(f"unknown-key warning missed actor typo: {warnings}")
    if failures:
        print("\n".join(failures))
        return 1
    print(f"SCHEMA OK: {len(files)} stories, {len(cases)} negative cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
