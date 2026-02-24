#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_DIR="${ROOT_DIR}/.npm-python-shim"

mkdir -p "${SHIM_DIR}"
cat > "${SHIM_DIR}/python" <<'EOF'
#!/usr/bin/env bash
exec python3 "$@"
EOF
chmod +x "${SHIM_DIR}/python"

PATH="${SHIM_DIR}:${PATH}" npm install "$@"
