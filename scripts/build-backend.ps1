$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$python = if ($env:CONTINUO_PYTHON) { $env:CONTINUO_PYTHON } else { '.\.venv\Scripts\python.exe' }
if (!(Test-Path $python)) { throw 'Create the Windows .venv and install requirements.txt first.' }
$ffmpeg = (Get-Command ffmpeg.exe -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe.exe -ErrorAction Stop).Source
& $python -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11 or newer is required'"
if ($LASTEXITCODE -ne 0) { throw 'Unsupported Python environment.' }
& $python scripts/prepare_model.py
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint preparation failed.' }

& $python -m PyInstaller --noconfirm --clean --onedir --console `
    --name continuo-analysis --specpath build --workpath build/pyinstaller `
    --hidden-import src.analysis_worker --collect-all beat_this --collect-all librosa `
    --additional-hooks-dir scripts/hooks --add-data 'build/models;models' `
    --add-binary "${ffmpeg};." --add-binary "${ffprobe};." analysis_entry.py
if ($LASTEXITCODE -ne 0) { throw 'Analysis backend build failed.' }
$modelFiles = Get-ChildItem 'dist/continuo-analysis' -Recurse -File | Where-Object { $_.FullName -match '[\\/]madmom[\\/]' -and $_.Extension -in '.pkl', '.npy', '.npz', '.h5', '.hdf5', '.mat' }
if ($modelFiles) { throw 'Unexpected madmom data/model files in backend bundle. Do not distribute this build.' }
Write-Host 'Backend built: dist\continuo-analysis\continuo-analysis.exe'
