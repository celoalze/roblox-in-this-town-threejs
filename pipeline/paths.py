"""The one place that knows the repository layout. Every module imports its directories from here."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ENGINE = ROOT / "engine"
CONFIG = ROOT / "config"
FORMATS = CONFIG / "formats"  # one folder per genre: format.json (lint limits + defaults) and FORMAT.md
ASSETS = ROOT / "assets"
STORIES = ROOT / "stories"
TEST_STORIES = ROOT / "tests" / "stories"  # regression stories (slugs starting with "_")
PUBLISH = ROOT / "publish"  # finished videos + platform text

CACHE = ROOT / "cache"  # regenerable; cache/tts holds synthesized narration (slow or paid to redo)
OUT = CACHE / "out"  # per-story work folder: timeline.json, mixes, previews, QA sheets

TOOLS = ROOT / "tools"
TTS_DIR = TOOLS / "audio" / "tts"  # local voice stack: virtualenv + model weights
TTS_VENV_PYTHON = TTS_DIR / ".venv-tts" / "Scripts" / "python.exe"
TTS_MODELS = TTS_DIR / "models"  # kokoro onnx files; hf/ = Hugging Face hub cache (Chatterbox, aligner)
