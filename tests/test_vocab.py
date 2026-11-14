"""Check that the vocabulary registry matches the current engine declarations."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
REGISTRY = json.loads((ROOT / "config" / "vocab.json").read_text(encoding="utf-8"))
OPEN_TO_CLOSE = {"{": "}", "[": "]", "(": ")"}
CLOSING = set(OPEN_TO_CLOSE.values())


def _skip_quoted(source, index):
    """Advance past a JavaScript string or template literal."""
    quote = source[index]
    index += 1
    while index < len(source):
        if source[index] == "\\":
            index += 2
        elif source[index] == quote:
            return index + 1
        else:
            index += 1
    return index


def _skip_comment(source, index):
    """Advance past a JavaScript line or block comment."""
    if source.startswith("//", index):
        end = source.find("\n", index + 2)
        return len(source) if end == -1 else end + 1
    end = source.find("*/", index + 2)
    return len(source) if end == -1 else end + 2


def _skip_trivia(source, index):
    """Advance across whitespace and comments."""
    while index < len(source):
        if source[index].isspace():
            index += 1
        elif source.startswith("//", index) or source.startswith("/*", index):
            index = _skip_comment(source, index)
        else:
            return index
    return index


def _literal(source, name):
    """Extract a declared array or object literal with delimiter matching."""
    declaration = re.search(
        rf"\b{re.escape(name)}\s*=\s*([\[\{{])",
        source,
        re.S,
    )
    if not declaration:
        raise AssertionError(f"Could not find the {name} literal.")

    start = declaration.start(1)
    stack = [OPEN_TO_CLOSE[source[start]]]
    index = start + 1
    while index < len(source):
        char = source[index]
        if char in ("'", '"', chr(96)):
            index = _skip_quoted(source, index)
        elif source.startswith("//", index) or source.startswith("/*", index):
            index = _skip_comment(source, index)
        elif char in OPEN_TO_CLOSE:
            stack.append(OPEN_TO_CLOSE[char])
            index += 1
        elif char in CLOSING:
            if not stack or char != stack[-1]:
                raise AssertionError(f"Unbalanced literal for {name}.")
            stack.pop()
            index += 1
            if not stack:
                return source[start:index]
        else:
            index += 1

    raise AssertionError(f"Unclosed literal for {name}.")


def _array_strings(literal):
    """Read single-quoted vocabulary strings from an array literal."""
    values = re.findall(r"'((?:\\.|[^'\\])*)'", literal, re.S)
    return [re.sub(r"\\(.)", r"\1", value) for value in values]


def _object_keys(literal):
    """Read top-level identifier keys from an object literal."""
    keys = []
    stack = ["}"]
    index = 1
    expect_key = True

    while index < len(literal) - 1:
        index = _skip_trivia(literal, index)
        if index >= len(literal) - 1:
            break

        char = literal[index]
        if char in ("'", '"', chr(96)):
            index = _skip_quoted(literal, index)
            continue

        if expect_key and len(stack) == 1:
            match = re.match(r"([A-Za-z_$][\w$]*)\s*:", literal[index:])
            if match:
                keys.append(match.group(1))
                index += match.end()
                expect_key = False
                continue

        if char in OPEN_TO_CLOSE:
            stack.append(OPEN_TO_CLOSE[char])
        elif char in CLOSING:
            if len(stack) > 1 and char == stack[-1]:
                stack.pop()
        elif char == "," and len(stack) == 1:
            expect_key = True
        index += 1

    return keys


def _array_assignment(source, name):
    """Extract strings from a named JavaScript array declaration."""
    return _array_strings(_literal(source, name))


def _object_assignment(source, name):
    """Extract keys from a named JavaScript object declaration."""
    return _object_keys(_literal(source, name))


def _case_labels(source):
    """Extract switch case labels while tolerating whitespace and line breaks."""
    return set(re.findall(r"\bcase\s*'([a-z0-9]+)'\s*:", source, re.S))


def _engine_vocab():
    """Re-derive the vocabulary that is declared by the engine."""
    character = (ENGINE / "characters" / "character.js").read_text(encoding="utf-8")
    face = (ENGINE / "characters" / "face" / "face.js").read_text(encoding="utf-8")
    face2 = (ENGINE / "characters" / "face" / "face2.js").read_text(encoding="utf-8")
    props = (ENGINE / "props" / "props.js").read_text(encoding="utf-8")
    fx_marker = re.search(r"//\s*-+\s*FX\b", props)
    if not fx_marker:
        raise AssertionError("Could not find the FX section marker in props.js.")

    return {
        "procedural_anims": _case_labels(character),
        "basic_exprs": set(_object_assignment(face, "EXPR")),
        "face2_exprs": set(_object_assignment(face2, "FACE2")),
        "brow_styles": set(_object_assignment(face2, "BROW_STYLES")),
        "pupils": set(_object_assignment(face2, "PUPIL_MUL")),
        "gaze_words": set(_array_assignment(face2, "GAZE_WORDS")),
        "procedural_props": _case_labels(props[: fx_marker.start()]),
        "no_hold_props": set(_array_assignment(props, "NO_HOLD")),
        "engine_fx_cases": _case_labels(props[fx_marker.end() :]),
        "creature_anims": set(_array_assignment(
            (ENGINE / "characters" / "creatures.js").read_text(encoding="utf-8"),
            "CREATURE_ANIMS",
        )),
        "link_modes": set(_array_assignment(
            (ENGINE / "characters" / "links.js").read_text(encoding="utf-8"),
            "LINK_MODES",
        )),
        "crowd_behaviours": set(_array_assignment(
            (ENGINE / "characters" / "crowd.js").read_text(encoding="utf-8"),
            "BEHAVIOURS",
        )),
    }


def main():
    """Compare engine-derived names with the checked-in registry."""
    failures = []
    engine_vocab = _engine_vocab()

    registry_vocab = {
        **engine_vocab,
        "procedural_anim_extras": {"idle"},
        "gaze_extras": {"auto"},
    }
    for name, expected in registry_vocab.items():
        values = REGISTRY.get(name)
        if not isinstance(values, list):
            failures.append(f"{name}: registry value is missing or not a list")
            continue

        actual = set(values)
        if len(actual) != len(values):
            failures.append(f"{name}: registry contains duplicate values")
        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            failures.append(f"{name}: missing={missing}, extra={extra}")

    if failures:
        print("VOCAB ERROR")
        for failure in failures:
            print(f"  {failure}")
        return 1

    print(f"VOCAB OK: {len(engine_vocab)} engine groups and 2 registry extras match config/vocab.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
