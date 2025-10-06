#!/usr/bin/env bash
set -euo pipefail

PORT_FROM_ARG="${1:-}"
PORT_ENV="${PORT:-}"
PORT="${PORT_FROM_ARG:-${PORT_ENV:-8090}}"
CLIENT_URL="http://localhost:${PORT}"
IMAGE_NAME="c2pa-demo"

SKIP_DOCKER="${SKIP_DOCKER:-0}"

echo "==> Checking prerequisites"
if [[ "${SKIP_DOCKER}" == "1" ]]; then
  echo "Skipping Docker prerequisite check (SKIP_DOCKER=1)"
else
  command -v docker >/dev/null 2>&1 || { echo "Docker is required but not found in PATH"; exit 1; }
fi
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not found in PATH"; exit 1; }

if [[ "${SKIP_DOCKER}" == "1" ]]; then
  echo "==> Skipping Docker image build (SKIP_DOCKER=1)"
else
  echo "==> Ensuring Docker image ${IMAGE_NAME} exists"
  if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo "Building ${IMAGE_NAME}..."
    docker build -t "${IMAGE_NAME}" .
  else
    echo "Docker image ${IMAGE_NAME} already present"
  fi
fi

echo "==> Building client"
pushd client >/dev/null
npm install
npm run build
popd >/dev/null

echo "==> Starting server on port ${PORT}"
PORT="${PORT}" node server.js &
SERVER_PID=$!

cleanup() {
  echo "\n==> Shutting down (pid ${SERVER_PID})"
  kill ${SERVER_PID} >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "==> Waiting for server to become ready"
for i in {1..50}; do
  if curl -fsS "http://localhost:${PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "==> Opening ${CLIENT_URL}"
if command -v open >/dev/null 2>&1; then
  open "${CLIENT_URL}" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${CLIENT_URL}" || true
else
  echo "Open manually: ${CLIENT_URL}"
fi

echo "==> Server logs (Ctrl+C to stop)"
wait ${SERVER_PID}
