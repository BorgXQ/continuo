$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$python = '.\.venv\Scripts\python.exe'
if (!(Test-Path $python)) { throw 'Create the Windows .venv and install requirements.txt first.' }
$ffmpeg = (Get-Command ffmpeg.exe -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe.exe -ErrorAction Stop).Source

& $python -m PyInstaller --noconfirm --clean --onedir --console `
    --name continuo-analysis --specpath build --workpath build/pyinstaller `
    --hidden-import src.analysis_worker --collect-all madmom --collect-all librosa `
    --add-binary "${ffmpeg};." --add-binary "${ffprobe};." analysis_entry.py
if ($LASTEXITCODE -ne 0) { throw 'Analysis backend build failed.' }
Write-Host 'Backend built: dist\continuo-analysis\continuo-analysis.exe'
