#!/bin/bash
set -eu

# ---------------------------------------------------------------------------
# anon.li CLI installer
# Usage: curl -fsSL https://anon.li/cli/install.sh | bash
#        bash install.sh [--uninstall] [--yes] [--version <ver>] [--help]
# ---------------------------------------------------------------------------

# ── Constants ──────────────────────────────────────────────────────────────

REGISTRY_URL="https://registry.npmjs.org/anonli/latest"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/anonli"
TMPFILES=()

LOGO='
   __ _ _ __   ___  _ __   | (_)
  / _` | '"'"'_ \ / _ \| '"'"'_ \  | | |
 | (_| | | | | (_) | | | |_| | |
  \__,_|_| |_|\___/|_| |_(_)_|_|'

# ── Colors (disabled when stdout is not a TTY) ────────────────────────────

if [ -t 1 ]; then
  BOLD="\033[1m"
  DIM="\033[2m"
  RED="\033[31m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  CYAN="\033[36m"
  RESET="\033[0m"
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" CYAN="" RESET=""
fi

# ── Helpers ────────────────────────────────────────────────────────────────

info()    { printf "${CYAN}ℹ${RESET} %s\n" "$*"; }
success() { printf "${GREEN}✔${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
error()   { printf "${RED}✖${RESET} %s\n" "$*" >&2; }

cleanup() {
  for f in "${TMPFILES[@]}"; do
    rm -f "$f" 2>/dev/null || true
  done
}
trap cleanup EXIT

confirm() {
  if [ "$AUTO_YES" = true ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    # Non-interactive — treat as yes
    return 0
  fi
  printf "%s ${DIM}[Y/n]${RESET} " "$1"
  read -r ans
  case "$ans" in
    [nN]*) return 1 ;;
    *) return 0 ;;
  esac
}

usage() {
  printf "${CYAN}%s${RESET}\n" "$LOGO"
  cat <<EOF

Usage: install.sh [options]

Options:
  -h, --help        Show this help message
  -u, --uninstall   Remove anon.li and optionally its config
  -y, --yes         Skip confirmation prompts
  -V, --version     Install a specific version (e.g. --version 0.2.0)

Examples:
  bash install.sh                  # Install or update
  bash install.sh --version 0.2.0  # Install specific version
  bash install.sh --uninstall      # Remove CLI
  curl -fsSL https://anon.li/cli/install.sh | bash -s -- --yes
EOF
}

# Detect preferred package manager. Prefer bun, fall back to npm.
detect_pm() {
  if command -v bun >/dev/null 2>&1; then
    echo "bun"
  elif command -v npm >/dev/null 2>&1; then
    echo "npm"
  else
    echo ""
  fi
}

# Detect which package manager originally installed the package.
detect_installed_pm() {
  local bin_path
  bin_path="$(command -v "anonli" 2>/dev/null || true)"
  if [ -z "$bin_path" ]; then
    echo ""
    return
  fi
  # Resolve symlinks to find the real path
  local real_path
  real_path="$(readlink -f "$bin_path" 2>/dev/null || realpath "$bin_path" 2>/dev/null || echo "$bin_path")"
  if echo "$real_path" | grep -q "\.bun"; then
    echo "bun"
  else
    echo "npm"
  fi
}

# Get currently installed version (empty string if not installed).
get_installed_version() {
  if ! command -v "anonli" >/dev/null 2>&1; then
    echo ""
    return
  fi
  "anonli" --version 2>/dev/null | head -1 | sed 's/^v//' || echo ""
}

# Fetch latest version from the npm registry.
get_latest_version() {
  local tmpfile
  tmpfile="$(mktemp)"
  TMPFILES+=("$tmpfile")

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --max-time 10 "$REGISTRY_URL" -o "$tmpfile" 2>/dev/null || { echo ""; return; }
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$tmpfile" --timeout=10 "$REGISTRY_URL" 2>/dev/null || { echo ""; return; }
  else
    echo ""
    return
  fi

  # Extract version from JSON without requiring jq
  sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmpfile" | head -1
}

# Compare two semver strings. Returns 0 if $1 >= $2, 1 otherwise.
version_gte() {
  local IFS=.
  local i a=($1) b=($2)
  for ((i = 0; i < 3; i++)); do
    local va="${a[i]:-0}"
    local vb="${b[i]:-0}"
    if ((va > vb)); then return 0; fi
    if ((va < vb)); then return 1; fi
  done
  return 0
}

# Check Node.js is installed and >= 18
check_node() {
  if ! command -v node >/dev/null 2>&1; then
    error "Node.js is not installed."
    echo "  Install Node.js 18+ from https://nodejs.org"
    exit 1
  fi

  local node_version
  node_version="$(node --version | sed 's/^v//')"
  local major
  major="$(echo "$node_version" | cut -d. -f1)"

  if [ "$major" -lt 18 ] 2>/dev/null; then
    error "Node.js ${node_version} is too old (need 18+)."
    echo "  Update Node.js: https://nodejs.org"
    exit 1
  fi
}

# ── Argument parsing ──────────────────────────────────────────────────────

MODE="install"  # install | uninstall
AUTO_YES=false
TARGET_VERSION=""

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -u|--uninstall)
      MODE="uninstall"
      shift
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    -V|--version)
      if [ -z "${2:-}" ]; then
        error "--version requires a value (e.g. --version 0.2.0)"
        exit 1
      fi
      TARGET_VERSION="$2"
      shift 2
      ;;
    *)
      error "Unknown option: $1"
      echo ""
      usage
      exit 1
      ;;
  esac
done

# ── Header ────────────────────────────────────────────────────────────────

printf "${CYAN}%s${RESET}\n" "$LOGO"
printf "  ${DIM}Encrypted drops & anonymous aliases${RESET}\n\n"

# ── Uninstall mode ────────────────────────────────────────────────────────

if [ "$MODE" = "uninstall" ]; then
  installed_version="$(get_installed_version)"
  if [ -z "$installed_version" ]; then
    warn "anon.li is not installed — nothing to remove."
    exit 0
  fi

  info "Found anon.li v${installed_version}"

  pm="$(detect_installed_pm)"
  if [ -z "$pm" ]; then
    pm="$(detect_pm)"
  fi
  if [ -z "$pm" ]; then
    error "Cannot detect package manager to uninstall with."
    echo "  Run manually: npm uninstall -g anonli"
    exit 1
  fi

  if ! confirm "Remove anon.li v${installed_version} (via ${pm})?"; then
    info "Cancelled."
    exit 0
  fi

  info "Removing anon.li..."
  if [ "$pm" = "bun" ]; then
    bun remove -g "anonli"
  else
    npm uninstall -g "anonli"
  fi
  success "Removed anon.li."

  if [ -d "$CONFIG_DIR" ]; then
    if confirm "Also remove config directory (${CONFIG_DIR})?"; then
      rm -rf "$CONFIG_DIR"
      success "Removed ${CONFIG_DIR}."
    else
      info "Kept ${CONFIG_DIR}."
    fi
  fi

  printf "\n  ${DIM}Goodbye!${RESET}\n\n"
  exit 0
fi

# ── Install / Update mode ─────────────────────────────────────────────────

# Pre-flight: Node.js version
info "Checking Node.js..."
check_node
node_version="$(node --version)"
success "Node.js ${node_version}"

# Pre-flight: package manager
info "Detecting package manager..."
PM="$(detect_pm)"
if [ -z "$PM" ]; then
  error "No supported package manager found."
  echo "  Install one of:"
  echo "    - bun:  https://bun.sh"
  echo "    - npm:  https://nodejs.org"
  exit 1
fi
success "Using ${PM}"

# Check existing installation
installed_version="$(get_installed_version)"

if [ -n "$installed_version" ] && [ -z "$TARGET_VERSION" ]; then
  # Update path: compare versions
  info "Found anon.li v${installed_version}, checking for updates..."

  latest_version="$(get_latest_version)"

  if [ -z "$latest_version" ]; then
    warn "Could not reach npm registry — skipping version check."
    if ! confirm "Reinstall anon.li anyway?"; then
      info "Cancelled."
      exit 0
    fi
  elif [ "$installed_version" = "$latest_version" ]; then
    success "anon.li v${installed_version} is already up to date."
    exit 0
  else
    printf "  ${DIM}${installed_version}${RESET} → ${GREEN}${latest_version}${RESET}\n"
    if ! confirm "Update anon.li?"; then
      info "Cancelled."
      exit 0
    fi
  fi

  info "Updating anon.li..."
  if [ "$PM" = "bun" ]; then
    bun install -g "anonli"
  else
    npm install -g "anonli"
  fi
  new_version="$(get_installed_version)"
  success "Updated anon.li to v${new_version}."

elif [ -n "$installed_version" ] && [ -n "$TARGET_VERSION" ]; then
  # Specific version requested while already installed
  if [ "$installed_version" = "$TARGET_VERSION" ]; then
    success "anon.li v${TARGET_VERSION} is already installed."
    exit 0
  fi

  info "Switching anon.li v${installed_version} → v${TARGET_VERSION}..."
  if [ "$PM" = "bun" ]; then
    bun install -g "anonli@${TARGET_VERSION}"
  else
    npm install -g "anonli@${TARGET_VERSION}"
  fi
  success "Installed anon.li v${TARGET_VERSION}."

else
  # Fresh install
  local_pkg="anonli"
  if [ -n "$TARGET_VERSION" ]; then
    local_pkg="anonli@${TARGET_VERSION}"
  fi

  info "Installing ${local_pkg}..."
  if [ "$PM" = "bun" ]; then
    bun install -g "$local_pkg"
  else
    npm install -g "$local_pkg"
  fi

  new_version="$(get_installed_version)"
  if [ -n "$new_version" ]; then
    success "Installed anon.li v${new_version}."
  else
    success "Installed anon.li."
  fi
fi

# ── Post-install: PATH check ──────────────────────────────────────────────

if ! command -v "anonli" >/dev/null 2>&1; then
  echo ""
  warn "anonli was installed but is not in your PATH."
  echo ""
  if [ "$PM" = "npm" ]; then
    npm_bin="$(npm bin -g 2>/dev/null || echo "")"
    if [ -n "$npm_bin" ]; then
      echo "  Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
      echo ""
      echo "    export PATH=\"${npm_bin}:\$PATH\""
      echo ""
    fi
  elif [ "$PM" = "bun" ]; then
    echo "  Run: bun setup"
    echo "  Then restart your shell."
    echo ""
  fi
fi

# ── Getting started ───────────────────────────────────────────────────────

printf "\n  ${BOLD}Get started:${RESET}\n"
printf "    ${CYAN}\$${RESET} anonli login      ${DIM}# Log in to your account${RESET}\n"
printf "    ${CYAN}\$${RESET} anonli drop       ${DIM}# Create an encrypted file drop${RESET}\n"
printf "    ${CYAN}\$${RESET} anonli alias      ${DIM}# Manage email aliases${RESET}\n"
printf "    ${CYAN}\$${RESET} anonli --help     ${DIM}# See all commands${RESET}\n"
echo ""
