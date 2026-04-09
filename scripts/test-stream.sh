#!/usr/bin/env bash
# test-stream.sh — Simula un stream RTMP de prueba con ffmpeg
# Uso: ./scripts/test-stream.sh <stream_key>
# Ejemplo: ./scripts/test-stream.sh abc123-uuid-aqui

set -e

STREAM_KEY="${1:-}"
RTMP_HOST="${RTMP_HOST:-localhost}"
RTMP_PORT="${RTMP_PORT:-1935}"

if [[ -z "$STREAM_KEY" ]]; then
  echo "Error: se requiere el stream key como primer argumento"
  echo "Uso: $0 <stream_key>"
  exit 1
fi

if ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg no está instalado"
  echo "  macOS:  brew install ffmpeg"
  echo "  Ubuntu: apt install ffmpeg"
  exit 1
fi

RTMP_URL="rtmp://${RTMP_HOST}:${RTMP_PORT}/live/${STREAM_KEY}"

echo "──────────────────────────────────────────────"
echo " Castify — Stream de prueba"
echo "──────────────────────────────────────────────"
echo " RTMP URL : ${RTMP_URL}"
echo " Presioná Ctrl+C para detener"
echo "──────────────────────────────────────────────"

ffmpeg \
  -re \
  -f lavfi -i "testsrc2=size=1280x720:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -c:v libx264 \
    -preset veryfast \
    -tune zerolatency \
    -b:v 2500k \
    -maxrate 2500k \
    -bufsize 5000k \
    -g 60 \
    -keyint_min 60 \
    -sc_threshold 0 \
    -pix_fmt yuv420p \
  -c:a aac \
    -b:a 128k \
    -ar 44100 \
  -f flv \
  "${RTMP_URL}"
