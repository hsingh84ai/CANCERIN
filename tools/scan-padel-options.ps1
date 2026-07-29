# Sweeps PaDEL standardisation options to find settings that reproduce the
# stored background fingerprints for test.smi (NSC 17 -> row 0, 185 -> row 1).
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$combos = @(
  @{ name = 'baseline';                       flags = @() },
  @{ name = 'removesalt';                     flags = @('-removesalt') },
  @{ name = 'standardizenitro';               flags = @('-standardizenitro') },
  @{ name = 'removesalt+nitro';               flags = @('-removesalt', '-standardizenitro') },
  @{ name = 'detectaromaticity';              flags = @('-detectaromaticity') },
  @{ name = 'removesalt+nitro+aromaticity';   flags = @('-removesalt', '-standardizenitro', '-detectaromaticity') },
  @{ name = 'standardizetautomers';           flags = @('-standardizetautomers') },
  @{ name = 'convert3d';                      flags = @('-convert3d') },
  @{ name = 'all-standardisation';            flags = @('-removesalt', '-standardizenitro', '-standardizetautomers', '-detectaromaticity') }
)

foreach ($c in $combos) {
  $outfile = "scan_$($c.name -replace '[^a-zA-Z0-9]','_').csv"
  if (Test-Path $outfile) { Remove-Item $outfile -Force }
  $args = @('-Xmx1024M', '-jar', 'PaDEL-Descriptor.jar', '-fingerprints',
            '-descriptortypes', 'descriptors.xml') + $c.flags + @('-dir', 'test.smi', '-file', $outfile)
  $null = & java $args 2>&1
  if (Test-Path $outfile) {
    $r = node tools/score-scan.mjs $outfile
    Write-Host ("{0,-32} {1}" -f $c.name, $r)
  } else {
    Write-Host ("{0,-32} FAILED" -f $c.name)
  }
}
