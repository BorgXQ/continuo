$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$python = if ($env:CONTINUO_PYTHON) { $env:CONTINUO_PYTHON } else { '.\.venv\Scripts\python.exe' }
if (!(Test-Path $python)) { throw 'Create the Windows .venv and install requirements.txt first.' }
& $python -c "import sys; assert sys.version_info >= (3, 11), 'Python 3.11 or newer is required'"
if ($LASTEXITCODE -ne 0) { throw 'Unsupported Python environment.' }
& $python scripts/prepare_model.py
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint preparation failed.' }
$models = (Resolve-Path 'build/models').Path

& $python -m PyInstaller --noconfirm --clean --onedir --console `
    --name continuo-analysis --specpath build --workpath build/pyinstaller `
    --hidden-import src.analysis_worker --collect-all beat_this --collect-all librosa `
    --exclude-module matplotlib --exclude-module librosa.display --exclude-module IPython `
    --exclude-module ipywidgets --exclude-module plotly --exclude-module anywidget `
    --exclude-module pandas --exclude-module pyarrow --exclude-module notebook --exclude-module jupyterlab `
    --exclude-module madmom --add-data "${models};models" `
    analysis_entry.py
if ($LASTEXITCODE -ne 0) { throw 'Analysis backend build failed.' }
Write-Host 'Backend built: dist\continuo-analysis\continuo-analysis.exe'
