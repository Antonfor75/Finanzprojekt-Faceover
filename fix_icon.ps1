$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$imgPath = 'c:\Anton\Finanzenprojekt\public\app-icon.png'
$backupPath = 'c:\Anton\Finanzenprojekt\public\app-icon-original.png'

# Ensure source exists
if (-not (Test-Path $imgPath)) {
    Write-Error "File not found: $imgPath"
    exit 1
}

$img = [System.Drawing.Image]::FromFile($imgPath)

# Check dimensions to avoid duplicate processing
if ($img.Width -eq 512 -and $img.Height -eq 512) {
    Write-Output "Image is already 512x512. No changes made."
    $img.Dispose()
    exit 0
}

Write-Output "Processing New Image. Original Size: $($img.Width)x$($img.Height)"
$srcWidth = $img.Width
$srcHeight = $img.Height
$img.Dispose()

# Create Backup of this NEW master (since old backups are gone/irrelevant)
if (-not (Test-Path $backupPath)) {
    Copy-Item $imgPath $backupPath -Force
    Write-Output "Created backup of original upload."
}

# Reload from Backup (safe source)
$img = [System.Drawing.Image]::FromFile($backupPath)

# Calculate Center Square Crop
$minSide = [Math]::Min($srcWidth, $srcHeight)
$x = [Math]::Floor(($srcWidth - $minSide) / 2)
$y = [Math]::Floor(($srcHeight - $minSide) / 2)

# Create 512x512 Destination Bitmap
$targetSize = 512
try {
    $dest = New-Object System.Drawing.Bitmap $targetSize, $targetSize
}
catch {
    Write-Error "Failed to create Bitmap: $_"
    exit 1
}

$gfx = [System.Drawing.Graphics]::FromImage($dest)
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gfx.Clear([System.Drawing.Color]::Transparent)

$srcRect = New-Object System.Drawing.Rectangle $x, $y, $minSide, $minSide
$destRect = New-Object System.Drawing.Rectangle 0, 0, $targetSize, $targetSize

$gfx.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

$img.Dispose()
$gfx.Dispose()

# Save final icon
try {
    $dest.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Success. Processed to 512x512."
}
catch {
    Write-Error "Failed to save: $_"
    exit 1
}
finally {
    $dest.Dispose()
}
