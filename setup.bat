@echo off
cd /d %~dp0
call npm install
python -m pip install -r requirements.txt
set TTSM=tools/audio/tts/models
if not exist "%TTSM%" mkdir "%TTSM%"
if not exist "%TTSM%/kokoro-v1.0.int8.onnx" curl -L -o "%TTSM%/kokoro-v1.0.int8.onnx" https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
if not exist "%TTSM%/voices-v1.0.bin" curl -L -o "%TTSM%/voices-v1.0.bin" https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
echo Setup done.
