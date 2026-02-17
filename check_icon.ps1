Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('c:\Anton\Finanzenprojekt\public\app-icon.png')
Write-Output "Size: $($img.Width)x$($img.Height)"
$img.Dispose()
$file = Get-Item 'c:\Anton\Finanzenprojekt\public\app-icon.png'
Write-Output "LastModified: $($file.LastWriteTime)"
