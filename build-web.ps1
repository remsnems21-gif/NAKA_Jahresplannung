$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$output = Join-Path $root 'dist'
$assets = @('styles.css', 'app.js', 'management.js', 'cloud.js', 'supabase-config.js')
$expected = @('index.html', '.nojekyll') + $assets
if (Test-Path -LiteralPath $output) {
    $existing = @(Get-ChildItem -LiteralPath $output -Force)
    if (@($existing | Where-Object { $_.PSIsContainer -or $_.Name -notin $expected }).Count) {
        throw 'Unexpected files in dist. Review them before rebuilding; no files were removed.'
    }
}
New-Item -ItemType Directory -Path $output -Force | Out-Null
foreach ($file in $assets) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $output $file)
}
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'))
$html = $html -replace '(?m)^.*<script src="(?:template-activities|management-data)\.js[^"]*" defer></script>\r?\n', ''
$html = $html.Replace('  <script src="cloud.js', "  <script src=`"supabase-config.js?v=20261112-4`" defer></script>`n  <script src=`"cloud.js")
$csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src https://ubuwstptroyarcuglpig.supabase.co; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'"
$html = $html.Replace('  <meta name="referrer"', "  <meta http-equiv=`"Content-Security-Policy`" content=`"$csp`">`n  <meta name=`"referrer`"")
if ($html -match 'src="(?:template-activities|management-data)\.js') {
    throw 'Internal source scripts must not be included in the web build.'
}
[IO.File]::WriteAllText((Join-Path $output 'index.html'), $html, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $output '.nojekyll'), '', [Text.UTF8Encoding]::new($false))
$actual = @(Get-ChildItem -LiteralPath $output -Force -File | Select-Object -ExpandProperty Name)
if ($actual.Count -ne $expected.Count -or @($actual | Where-Object { $_ -notin $expected }).Count) {
    throw 'Unexpected web build contents.'
}
Write-Output "Web build ready: $output"
Write-Output 'No source documents, original template records or backups are included.'
