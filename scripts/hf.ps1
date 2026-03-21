param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CliArgs
)

$script:Candidates = @()

if ($env:HF_PYTHON) {
    $script:Candidates += $env:HF_PYTHON
}

$script:Candidates += @(
    "C:\Users\leonard\Documents\GitHub\test\.venv\Scripts\python.exe"
)

foreach ($candidate in $script:Candidates) {
    if ($candidate -and (Test-Path $candidate)) {
        & $candidate "$PSScriptRoot\hf.py" @CliArgs
        exit $LASTEXITCODE
    }
}

$fallback = Get-ChildItem -Path "$env:USERPROFILE\Documents" -Recurse -Filter python.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

if ($fallback) {
    & $fallback "$PSScriptRoot\hf.py" @CliArgs
    exit $LASTEXITCODE
}

Write-Error "No runnable Python interpreter found. Set HF_PYTHON to a valid python.exe path."
exit 1
