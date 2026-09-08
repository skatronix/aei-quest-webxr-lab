#!/bin/zsh
set -euo pipefail

HOST="${1:-}"
if [[ -z "$HOST" ]]; then
  echo "Usage: ./gen-cert.sh <MAC_LAN_IP>"
  echo "Example: ./gen-cert.sh 192.168.1.42"
  exit 1
fi

mkdir -p certs
openssl req \
  -x509 \
  -newkey rsa:2048 \
  -sha256 \
  -nodes \
  -days 30 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/CN=$HOST" \
  -addext "subjectAltName=IP:$HOST,DNS:localhost"

chmod 600 certs/key.pem

echo "Created certs/cert.pem + certs/key.pem for $HOST"
echo "On Quest, open https://$HOST:8443 once and accept the local certificate warning before connecting WSS."
