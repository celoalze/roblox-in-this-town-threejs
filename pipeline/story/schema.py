"""Validate story.json against the local authoring schema without third-party packages."""

import difflib
import json
import re
from functools import lru_cache
from pathlib import Path


SCHEMA_PATH = Path(__file__).resolve().parents[2] / "config" / "schema" / "story.schema.json"


@lru_cache(maxsize=1)
def _schema():
    """Load the formal story contract once per process."""
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _kind(value):
    """Return a JSON-style primitive type name for a Python value."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "integer" if value.is_integer() else "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _matches_type(value, expected):
    """Check one JSON Schema primitive type without treating booleans as numbers."""
    if expected == "null":
        return value is None
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return (isinstance(value, int) and not isinstance(value, bool)) or (
            isinstance(value, float) and value.is_integer()
        )
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return False


def _path_key(path, key):
    """Append a JSON object key to the displayed path."""
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", str(key)):
        return f"{path}.{key}"
    return f"{path}[{json.dumps(str(key))}]"


def _resolve_ref(root, ref):
    """Resolve a local JSON Pointer reference."""
    if not ref.startswith("#/"):
        return None
    current = root
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current if isinstance(current, dict) else None


def _branch_types(branches, root):
    """Collect primitive branch types for concise union error messages."""
    found = []
    for branch in branches:
        target = branch
        if "$ref" in branch:
            target = _resolve_ref(root, branch["$ref"]) or {}
        kinds = target.get("type")
        if isinstance(kinds, str):
            kinds = [kinds]
        if kinds:
            for kind in kinds:
                if kind not in found:
                    found.append(kind)
    return found


def _expected_text(kinds):
    """Format a list of expected primitive types for an error."""
    names = ["number" if kind == "integer" else kind for kind in kinds]
    return " or ".join(names)


def _check(value, schema, root, path, errors):
    """Apply the supported JSON Schema keywords at one value."""
    if "$ref" in schema:
        target = _resolve_ref(root, schema["$ref"])
        if target is None:
            errors.append(f"{path}: unresolved local schema reference {schema['$ref']}")
            return
        _check(value, target, root, path, errors)
        return
    for keyword in ("oneOf", "anyOf"):
        if keyword in schema:
            branches = schema[keyword]
            outcomes = []
            for branch in branches:
                branch_errors = []
                _check(value, branch, root, path, branch_errors)
                outcomes.append(branch_errors)
            matched = sum(not outcome for outcome in outcomes)
            if keyword == "oneOf" and matched == 1 or keyword == "anyOf" and matched > 0:
                return
            if keyword == "oneOf" and matched > 1:
                errors.append(f"{path}: value matches more than one allowed shape")
                return
            compatible = []
            for branch, outcome in zip(branches, outcomes):
                kinds = _branch_types([branch], root)
                if any(_matches_type(value, kind) for kind in kinds):
                    compatible.append(outcome)
            if len(compatible) == 1 and compatible[0]:
                errors.extend(compatible[0])
                return
            kinds = _branch_types(branches, root)
            if kinds:
                errors.append(f"{path}: expected {_expected_text(kinds)}, got {_kind(value)}")
            else:
                errors.append(f"{path}: value does not match any allowed shape")
            return
    expected = schema.get("type")
    if expected:
        kinds = expected if isinstance(expected, list) else [expected]
        if not any(_matches_type(value, kind) for kind in kinds):
            errors.append(f"{path}: expected {_expected_text(kinds)}, got {_kind(value)}")
            return
    if "enum" in schema and value not in schema["enum"]:
        choices = ", ".join(repr(choice) for choice in schema["enum"])
        errors.append(f"{path}: expected one of {choices}, got {value!r}")
    if "pattern" in schema and isinstance(value, str):
        if re.search(schema["pattern"], value) is None:
            errors.append(f"{path}: value does not match pattern {schema['pattern']!r}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: expected at least {schema['minimum']}, got {value}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: expected at most {schema['maximum']}, got {value}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: expected at least {schema['minItems']} items, got {len(value)}")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, item in enumerate(value):
                _check(item, item_schema, root, f"{path}[{index}]", errors)
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{_path_key(path, key)}: required property is missing")
        for key, child in value.items():
            child_path = _path_key(path, key)
            if key in properties:
                _check(child, properties[key], root, child_path, errors)
                continue
            additional = schema.get("additionalProperties", True)
            if additional is False:
                errors.append(f"{child_path}: unknown property")
            elif isinstance(additional, dict):
                _check(child, additional, root, child_path, errors)


def validate(story: dict) -> list[str]:
    """Return structural errors for a story document, each with its JSON path."""
    errors = []
    _check(story, _schema(), _schema(), "$", errors)
    return errors


def _unknown_message(path, key, known):
    """Format an unknown key warning with a close spelling when one exists."""
    matches = difflib.get_close_matches(str(key), sorted(known), n=1, cutoff=0.7)
    hint = f"; did you mean {matches[0]!r}?" if matches else ""
    return f"{path}: unknown key{hint}"


def unknown_keys(story: dict) -> list[str]:
    """List unrecognized top-level and scene keys as non-blocking warnings."""
    if not isinstance(story, dict):
        return []
    definitions = _schema().get("$defs", {})
    story_keys = set(definitions.get("Story", {}).get("properties", {}))
    scene_keys = set(definitions.get("Scene", {}).get("properties", {}))
    story_keys.add("_errors")
    warnings = []
    for key in story:
        if key not in story_keys:
            warnings.append(_unknown_message(_path_key("story", key), key, story_keys))
    scenes = story.get("scenes")
    if isinstance(scenes, list):
        for index, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue
            for key in scene:
                if key not in scene_keys:
                    path = _path_key(f"scenes[{index}]", key)
                    warnings.append(_unknown_message(path, key, scene_keys))
    return warnings
