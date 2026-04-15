#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.prod"
NGINX_AVAILABLE="/etc/nginx/sites-available/castify"
NGINX_ENABLED="/etc/nginx/sites-enabled/castify"
NGINX_TEMPLATE="$REPO_ROOT/nginx/castify.conf"

# ─── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "[castify] $*"; }
err()  { echo "[castify] ERROR: $*" >&2; exit 1; }
need() { command -v "$1" &>/dev/null || err "'$1' no está instalado. Abortando."; }

# ─── Detectar si es primer setup ──────────────────────────────────────────────

FIRST_RUN=false
if [ ! -f "$ENV_FILE" ]; then
  FIRST_RUN=true
fi

# ─── Pedir dominio ────────────────────────────────────────────────────────────

if [ -n "$CASTIFY_DOMAIN" ]; then
  DOMAIN="$CASTIFY_DOMAIN"
else
  echo ""
  echo "========================================"
  echo "  Castify — Setup & Deploy"
  echo "========================================"
  echo ""
  read -rp "Ingresa tu dominio (ej: castify.example.com): " DOMAIN
  [ -z "$DOMAIN" ] && err "El dominio no puede estar vacío."
fi

log "Dominio: $DOMAIN"

# ─── Primer setup ─────────────────────────────────────────────────────────────

if [ "$FIRST_RUN" = true ]; then
  log "Primer setup detectado. Configurando servidor..."

  # Dependencias del sistema
  need git
  need docker
  need nginx
  need certbot

  # Crear .env.prod desde el template
  log "Creando .env.prod..."
  cp "$REPO_ROOT/.env.prod.example" "$ENV_FILE"

  # Generar secretos seguros
  JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
  STREAMING_SECRET=$(openssl rand -base64 32 | tr -d '\n')
  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '\n/+=' | head -c 24)

  # Sustituir valores en .env.prod
  sed -i "s|CASTIFY_DOMAIN|$DOMAIN|g"                  "$ENV_FILE"
  sed -i "s|STRONG_PASSWORD|$DB_PASSWORD|g"             "$ENV_FILE"
  sed -i "s|GENERATE_WITH_openssl_rand_-base64_64|$JWT_SECRET|g"       "$ENV_FILE"
  sed -i "s|GENERATE_WITH_openssl_rand_-base64_32|$STREAMING_SECRET|g" "$ENV_FILE"

  log ".env.prod generado con secretos aleatorios."

  # Configurar nginx en el host
  log "Configurando nginx (HTTP temporal para obtener certificado)..."

  # Primero desplegamos una config HTTP-only para que certbot pueda correr
  cat > "$NGINX_AVAILABLE" <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
EOF

  if [ ! -L "$NGINX_ENABLED" ]; then
    ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  fi

  # Desactivar default site para evitar conflictos de puerto 80
  rm -f /etc/nginx/sites-enabled/default

  log "Validando configuración nginx temporal..."
  nginx -t || err "Configuración nginx inválida. Revisa $NGINX_AVAILABLE."
  systemctl reload nginx

  # Obtener certificado SSL
  log "Obteniendo certificado SSL para $DOMAIN..."
  certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email \
    || err "Certbot falló. Asegúrate de que el dominio apunte a esta IP y el puerto 80 esté abierto."

  # Ahora aplicamos la config SSL completa
  log "Aplicando configuración nginx con SSL..."
  sed "s|CASTIFY_DOMAIN|$DOMAIN|g" "$NGINX_TEMPLATE" > "$NGINX_AVAILABLE"

  log "Validando configuración nginx SSL..."
  nginx -t || err "Configuración nginx SSL inválida. Revisa $NGINX_AVAILABLE."
  systemctl reload nginx
  log "SSL configurado correctamente."

else
  log "Actualizando configuración nginx con dominio: $DOMAIN"
  sed "s|CASTIFY_DOMAIN|$DOMAIN|g" "$NGINX_TEMPLATE" > "$NGINX_AVAILABLE"
  nginx -t && systemctl reload nginx
fi

# ─── Deploy ───────────────────────────────────────────────────────────────────

log "Actualizando código..."
cd "$REPO_ROOT"
git pull origin main

log "Construyendo imágenes Docker..."
docker compose -f docker-compose.prod.yml build --no-cache

log "Levantando servicios..."
docker compose -f docker-compose.prod.yml up -d

log "Esperando que la base de datos esté lista..."
sleep 5

log "Ejecutando migraciones Prisma..."
docker compose -f docker-compose.prod.yml exec -T api \
  npx prisma migrate deploy

log ""
log "========================================"
log "  Deploy completado"
log "  https://$DOMAIN"
log "========================================"
log ""
log "Verifica con:"
log "  docker compose -f docker-compose.prod.yml ps"
log "  curl https://$DOMAIN/api/streaming/health"
