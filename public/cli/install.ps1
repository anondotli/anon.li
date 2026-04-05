# ---------------------------------------------------------------------------
# anon.li CLI installer for Windows
# Usage: irm https://anon.li/cli/install.ps1 | iex
#        .\install.ps1 [-Uninstall] [-Yes] [-Version <ver>] [-Help]
#
# If you get a script execution error, run:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# ---------------------------------------------------------------------------

function Install-Anonli {
    # Force TLS 1.2 (PowerShell 5.1 defaults to TLS 1.0)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # ── Constants ────────────────────────────────────────────────────────
    $RegistryUrl = "https://registry.npmjs.org/anonli/latest"
    $PackageName = "anonli"

    $xdg = $env:XDG_CONFIG_HOME
    if ($xdg) {
        $ConfigDir = Join-Path $xdg $PackageName
    } else {
        $ConfigDir = Join-Path $HOME ".config" $PackageName
    }

    $Logo = @"

   __ _ _ __   ___  _ __   | (_)
  / _`` | '_ \ / _ \| '_ \  | | |
 | (_| | | | | (_) | | | |_| | |
  \__,_|_| |_|\___/|_| |_(_)_|_|
"@

    # ── Unicode detection ────────────────────────────────────────────────
    # Windows Terminal and PS 7+ generally support Unicode; fall back to ASCII
    $SupportsUnicode = $false
    if ($env:WT_SESSION -or $PSVersionTable.PSVersion.Major -ge 7) {
        $SupportsUnicode = $true
    }

    if ($SupportsUnicode) {
        $SymInfo    = [char]0x2139  # i
        $SymSuccess = [char]0x2714  # check
        $SymWarn    = [char]0x26A0  # warning
        $SymError   = [char]0x2716  # x
    } else {
        $SymInfo    = "i"
        $SymSuccess = "+"
        $SymWarn    = "!"
        $SymError   = "x"
    }

    # ── Helpers ──────────────────────────────────────────────────────────
    function Write-Info    { param([string]$Message) Write-Host "$SymInfo " -ForegroundColor Cyan -NoNewline; Write-Host $Message }
    function Write-Success { param([string]$Message) Write-Host "$SymSuccess " -ForegroundColor Green -NoNewline; Write-Host $Message }
    function Write-Warn    { param([string]$Message) Write-Host "$SymWarn " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
    function Write-Err     { param([string]$Message) Write-Host "$SymError " -ForegroundColor Red -NoNewline; Write-Host $Message }

    function Confirm-Action {
        param([string]$Prompt)
        if ($AutoYes) { return $true }
        if (-not [Environment]::UserInteractive) { return $true }
        Write-Host "$Prompt " -NoNewline
        Write-Host "[Y/n] " -ForegroundColor DarkGray -NoNewline
        $ans = Read-Host
        if ($ans -match "^[nN]") { return $false }
        return $true
    }

    function Show-Usage {
        Write-Host $Logo -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Usage: install.ps1 [options]"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  -Help, -h          Show this help message"
        Write-Host "  -Uninstall, -u     Remove anon.li and optionally its config"
        Write-Host "  -Yes, -y           Skip confirmation prompts"
        Write-Host "  -Version, -V       Install a specific version (e.g. -Version 0.2.0)"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\install.ps1                       # Install or update"
        Write-Host "  .\install.ps1 -Version 0.2.0        # Install specific version"
        Write-Host "  .\install.ps1 -Uninstall             # Remove CLI"
        Write-Host "  irm https://anon.li/cli/install.ps1 | iex"
    }

    # ── Package manager detection ────────────────────────────────────────
    function Get-PackageManager {
        if (Get-Command bun -ErrorAction SilentlyContinue) { return "bun" }
        if (Get-Command npm -ErrorAction SilentlyContinue) { return "npm" }
        return ""
    }

    function Get-InstalledPackageManager {
        $binPath = (Get-Command $PackageName -ErrorAction SilentlyContinue)
        if (-not $binPath) { return "" }
        $resolved = $binPath.Source
        if ($resolved -match "\.bun") { return "bun" }
        return "npm"
    }

    # ── Version helpers ──────────────────────────────────────────────────
    function Get-InstalledVersion {
        if (-not (Get-Command $PackageName -ErrorAction SilentlyContinue)) { return "" }
        try {
            $raw = & $PackageName --version 2>$null
            if ($raw) { return ($raw | Select-Object -First 1) -replace "^v", "" }
        } catch {}
        return ""
    }

    function Get-LatestVersion {
        try {
            $resp = Invoke-RestMethod -Uri $RegistryUrl -TimeoutSec 10 -ErrorAction Stop
            return $resp.version
        } catch {
            return ""
        }
    }

    function Test-NodeVersion {
        if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
            Write-Err "Node.js is not installed."
            Write-Host "  Install Node.js 18+ from https://nodejs.org"
            return $false
        }
        $raw = (node --version 2>$null) -replace "^v", ""
        try {
            $major = [int]($raw.Split(".")[0])
        } catch {
            Write-Err "Could not parse Node.js version: $raw"
            return $false
        }
        if ($major -lt 18) {
            Write-Err "Node.js $raw is too old (need 18+)."
            Write-Host "  Update Node.js: https://nodejs.org"
            return $false
        }
        return $true
    }

    # ── Install/uninstall via package manager ────────────────────────────
    function Invoke-PmInstall {
        param([string]$PM, [string]$Pkg)
        if ($PM -eq "bun") {
            & bun install -g $Pkg
        } else {
            & npm install -g $Pkg
        }
    }

    function Invoke-PmUninstall {
        param([string]$PM)
        if ($PM -eq "bun") {
            & bun remove -g $PackageName
        } else {
            & npm uninstall -g $PackageName
        }
    }

    # ── Refresh PATH from system environment ─────────────────────────────
    function Update-SessionPath {
        $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $userPath    = [System.Environment]::GetEnvironmentVariable("Path", "User")
        $env:Path = "$machinePath;$userPath"
    }

    # ── Argument parsing ─────────────────────────────────────────────────
    $Mode = "install"
    $AutoYes = $false
    $TargetVersion = ""

    $i = 0
    while ($i -lt $args.Count) {
        $arg = $args[$i]
        switch -Regex ($arg) {
            "^(-h|--help|-Help)$" {
                Show-Usage
                return
            }
            "^(-u|--uninstall|-Uninstall)$" {
                $Mode = "uninstall"
            }
            "^(-y|--yes|-Yes)$" {
                $AutoYes = $true
            }
            "^(-V|--version|-Version)$" {
                $i++
                if ($i -ge $args.Count) {
                    Write-Err "--version requires a value (e.g. --version 0.2.0)"
                    return
                }
                $TargetVersion = $args[$i]
            }
            default {
                Write-Err "Unknown option: $arg"
                Write-Host ""
                Show-Usage
                return
            }
        }
        $i++
    }

    # ── Header ───────────────────────────────────────────────────────────
    Write-Host $Logo -ForegroundColor Cyan
    Write-Host "  Encrypted drops & anonymous aliases" -ForegroundColor DarkGray
    Write-Host ""

    # ── Uninstall mode ───────────────────────────────────────────────────
    if ($Mode -eq "uninstall") {
        $installedVersion = Get-InstalledVersion
        if (-not $installedVersion) {
            Write-Warn "anon.li is not installed - nothing to remove."
            return
        }

        Write-Info "Found anon.li v${installedVersion}"

        $pm = Get-InstalledPackageManager
        if (-not $pm) { $pm = Get-PackageManager }
        if (-not $pm) {
            Write-Err "Cannot detect package manager to uninstall with."
            Write-Host "  Run manually: npm uninstall -g $PackageName"
            return
        }

        if (-not (Confirm-Action "Remove anon.li v${installedVersion} (via ${pm})?")) {
            Write-Info "Cancelled."
            return
        }

        Write-Info "Removing anon.li..."
        Invoke-PmUninstall -PM $pm
        Write-Success "Removed anon.li."

        if (Test-Path $ConfigDir) {
            if (Confirm-Action "Also remove config directory (${ConfigDir})?") {
                Remove-Item -Recurse -Force $ConfigDir
                Write-Success "Removed ${ConfigDir}."
            } else {
                Write-Info "Kept ${ConfigDir}."
            }
        }

        Write-Host ""
        Write-Host "  Goodbye!" -ForegroundColor DarkGray
        Write-Host ""
        return
    }

    # ── Install / Update mode ────────────────────────────────────────────

    # Pre-flight: Node.js version
    Write-Info "Checking Node.js..."
    if (-not (Test-NodeVersion)) { return }
    $nodeVersion = node --version 2>$null
    Write-Success "Node.js ${nodeVersion}"

    # Pre-flight: package manager
    Write-Info "Detecting package manager..."
    $PM = Get-PackageManager
    if (-not $PM) {
        Write-Err "No supported package manager found."
        Write-Host "  Install one of:"
        Write-Host "    - bun:  https://bun.sh"
        Write-Host "    - npm:  https://nodejs.org"
        return
    }
    Write-Success "Using ${PM}"

    # Check existing installation
    $installedVersion = Get-InstalledVersion

    if ($installedVersion -and -not $TargetVersion) {
        # Update path: compare versions
        Write-Info "Found anon.li v${installedVersion}, checking for updates..."

        $latestVersion = Get-LatestVersion

        if (-not $latestVersion) {
            Write-Warn "Could not reach npm registry - skipping version check."
            if (-not (Confirm-Action "Reinstall anon.li anyway?")) {
                Write-Info "Cancelled."
                return
            }
        } elseif ($installedVersion -eq $latestVersion) {
            Write-Success "anon.li v${installedVersion} is already up to date."
            return
        } else {
            Write-Host "  " -NoNewline
            Write-Host $installedVersion -ForegroundColor DarkGray -NoNewline
            Write-Host " -> " -NoNewline
            Write-Host $latestVersion -ForegroundColor Green
            if (-not (Confirm-Action "Update anon.li?")) {
                Write-Info "Cancelled."
                return
            }
        }

        Write-Info "Updating anon.li..."
        Invoke-PmInstall -PM $PM -Pkg $PackageName
        Update-SessionPath
        $newVersion = Get-InstalledVersion
        Write-Success "Updated anon.li to v${newVersion}."

    } elseif ($installedVersion -and $TargetVersion) {
        # Specific version requested while already installed
        if ($installedVersion -eq $TargetVersion) {
            Write-Success "anon.li v${TargetVersion} is already installed."
            return
        }

        Write-Info "Switching anon.li v${installedVersion} -> v${TargetVersion}..."
        Invoke-PmInstall -PM $PM -Pkg "${PackageName}@${TargetVersion}"
        Update-SessionPath
        Write-Success "Installed anon.li v${TargetVersion}."

    } else {
        # Fresh install
        $pkg = $PackageName
        if ($TargetVersion) {
            $pkg = "${PackageName}@${TargetVersion}"
        }

        Write-Info "Installing ${pkg}..."
        Invoke-PmInstall -PM $PM -Pkg $pkg
        Update-SessionPath

        $newVersion = Get-InstalledVersion
        if ($newVersion) {
            Write-Success "Installed anon.li v${newVersion}."
        } else {
            Write-Success "Installed anon.li."
        }
    }

    # ── Post-install: PATH check ─────────────────────────────────────────
    if (-not (Get-Command $PackageName -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Warn "anonli was installed but is not in your PATH."
        Write-Host ""
        if ($PM -eq "npm") {
            try {
                $npmBin = (npm prefix -g 2>$null)
                if ($npmBin) {
                    Write-Host "  Add this directory to your PATH:"
                    Write-Host ""
                    Write-Host "    $npmBin" -ForegroundColor Cyan
                    Write-Host ""
                }
            } catch {}
        } elseif ($PM -eq "bun") {
            Write-Host "  Ensure bun's global bin directory is in your PATH."
            Write-Host "  Restart your terminal, then try again."
            Write-Host ""
        }
    }

    # ── Getting started ──────────────────────────────────────────────────
    Write-Host ""
    Write-Host "  Get started:" -ForegroundColor White
    Write-Host -NoNewline "    "; Write-Host -NoNewline "`$" -ForegroundColor Cyan; Write-Host -NoNewline " anonli login      "; Write-Host "# Log in to your account" -ForegroundColor DarkGray
    Write-Host -NoNewline "    "; Write-Host -NoNewline "`$" -ForegroundColor Cyan; Write-Host -NoNewline " anonli drop       "; Write-Host "# Create an encrypted file drop" -ForegroundColor DarkGray
    Write-Host -NoNewline "    "; Write-Host -NoNewline "`$" -ForegroundColor Cyan; Write-Host -NoNewline " anonli alias      "; Write-Host "# Manage email aliases" -ForegroundColor DarkGray
    Write-Host -NoNewline "    "; Write-Host -NoNewline "`$" -ForegroundColor Cyan; Write-Host -NoNewline " anonli --help     "; Write-Host "# See all commands" -ForegroundColor DarkGray
    Write-Host ""
}

Install-Anonli @args
