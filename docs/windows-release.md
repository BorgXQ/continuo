# Windows v1.0.0 Build

Build on Windows x64, not WSL, using the working Python 3.9 virtual environment
with the analysis dependencies already installed. Node 24 is required to build;
end users should not need Python, Node, or FFmpeg.

From PowerShell in the repository:

```powershell
npm ci
.\.venv\Scripts\python.exe -m pip install "pyinstaller>=6,<7" "setuptools<81"
Get-Command ffmpeg.exe, ffprobe.exe
npm run typecheck
npm test
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

In particular, madmom's code and pretrained models have different licenses.
The models are CC BY-NC-SA 4.0, not unrestricted commercial-use assets:
https://github.com/CPJKU/madmom/blob/master/LICENSE
Retain attribution and license notices and review the model terms before release.
The font license is already included in the Electron resources.

Unsigned builds can encounter Windows security warnings. Do not instruct users
to disable security software; investigate/sign the release as appropriate.
