# Windows v1.0.0 Build

Build on Windows x64, not WSL, using a Python 3.11 virtual environment
with the analysis dependencies already installed. Node 24 is required to build;
end users should not need Python, Node, or FFmpeg.

From PowerShell in the repository:

```powershell
npm ci
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt "pyinstaller>=6,<7"
.\.venv\Scripts\python.exe -m pip check
Get-Command ffmpeg.exe, ffprobe.exe
npm run typecheck
npm test
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_*.py'
npm run build:backend
.\dist\continuo-analysis\continuo-analysis.exe "C:\Music\your-track.mp3"
```

Use an existing MP3 for the last command. The worker must finish with a JSON
message whose state is `complete`. A successful build alone is not sufficient:
scientific dependencies may need additional PyInstaller collection rules.
Use an FFmpeg distribution containing both executables; if they depend on
external DLLs, those must also be bundled. Static builds simplify this step.

After the backend test succeeds:

```powershell
npm run make -- --platform=win32 --arch=x64
```

The installer is under `out/make/squirrel.windows/x64/`. The backend folder is
included automatically. Packaged Windows builds use it, never system Python or
CONTINUO_PYTHON. Development still uses the existing Python launch mechanism.
Rebuild the backend whenever Python source or dependencies change.
The build script uses CONTINUO_PYTHON when set, otherwise .venv. It downloads
and validates Beat This!'s small0 checkpoint and includes it and its MIT license
in the bundle. This download requires internet access during the build, not
during installed-app analysis. The DBN uses madmom code, not madmom model files;
a packaging hook omits model data and a post-build check rejects accidental inclusion.
Installing the pinned madmom source dependency requires Git and Microsoft C++ Build Tools.

## Release Checks

- Test the installer in a clean Windows VM without Python, Node, or FFmpeg.
- Import an MP3, analyze it, cancel analysis, and test queued analysis.
- Test every playback mode, mode switching, fades, volume, and simultaneous tracks.
- Restart and verify tracks, analysis, and settings persist; test missing files.
- Test paths with spaces and non-ASCII characters, and uninstall/reinstall.
- Record the working Python dependency versions and FFmpeg build for reproducibility.
- Finalize README, CHANGELOG, dependency notices, and signing before publishing.

## Distribution Notices

This build setup is not a completed license audit. Include the license notices
for bundled Python packages, the runtime, and your exact FFmpeg distribution;
meet any applicable source-distribution obligations before publishing.

Beat This!'s code and published model weights are MIT-licensed. Its license is
included alongside the bundled checkpoint. The authors note that some training
material has separate restrictions; review their licensing statement:
https://github.com/CPJKU/beat_this#license
No madmom models are included in the new backend. Rebuild old bundles before release.
The BSD license notice for madmom's DBN code is bundled alongside the checkpoint.
The font license is already included in the Electron resources.

Unsigned builds can encounter Windows security warnings. Do not instruct users
to disable security software; investigate/sign the release as appropriate.
