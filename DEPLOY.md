# Castify — Deploy en VPS Ubuntu 22.04

## Requisitos previos

- VPS con Ubuntu 22.04
- Dominio apuntando a la IP del servidor (registro A en tu DNS)
- Puertos abiertos: 22 (SSH), 80 (HTTP), 443 (HTTPS), 1935 (RTMP)

---

## Setup inicial

### 1. Instalar dependencias del sistema

```bash
apt update && apt upgrade -y
apt install -y git curl nginx certbot python3-certbot-nginx ffmpeg
```

### 2. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker   # aplicar grupo sin cerrar sesión
```

### 3. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/p2p-streaming.git /opt/castify
cd /opt/castify
```

### 4. Primer deploy (configura todo)

El script detecta que es la primera ejecución, te pide el dominio y:
- Genera `.env.prod` con secretos aleatorios
- Configura nginx en el host con tu dominio
- Obtiene el certificado SSL via Let's Encrypt
- Construye las imágenes Docker y levanta todos los servicios
- Ejecuta las migraciones de Prisma

```bash
./scripts/deploy.sh
```

> También puedes pasar el dominio como variable de entorno para saltarte el prompt:
> ```bash
> CASTIFY_DOMAIN=castify.tudominio.com ./scripts/deploy.sh
> ```

---

## Deploys subsiguientes

Cualquier actualización de código se despliega con el mismo script:

```bash
cd /opt/castify
./scripts/deploy.sh
```

El script reconoce que `.env.prod` ya existe y solo hace `git pull` + build + up + migraciones.

---

## Verificación

```bash
# Estado de los contenedores
docker compose -f docker-compose.prod.yml ps

# Health check de la API
curl https://TU_DOMINIO/api/streaming/health

# Logs en tiempo real
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

---

## Servicios y puertos

| Servicio    | Puerto interno | Expuesto via       |
|-------------|----------------|--------------------|
| Next.js web | 3000           | nginx 443 → /      |
| NestJS api  | 3001           | nginx 443 → /api   |
| HLS nginx   | 8081           | nginx 443 → /live  |
| Tracker WS  | 1337           | nginx 443 → /announce |
| SRS RTMP    | 1935           | Docker directo     |
| PostgreSQL  | 5432           | interno solamente  |
| Redis       | 6379           | interno solamente  |

---

## Renovación SSL automática

Let's Encrypt renueva automáticamente via el timer de systemd que instala certbot.
Para verificar:

```bash
systemctl status certbot.timer
certbot renew --dry-run
```

---

## Estructura de archivos relevantes

```
.
├── apps/api/Dockerfile          # Multi-stage build monorepo NestJS
├── apps/web/Dockerfile          # Multi-stage build monorepo Next.js (standalone)
├── tracker/Dockerfile           # Bittorrent tracker WS
├── docker-compose.prod.yml      # Stack completo de producción
├── nginx/
│   ├── castify.conf             # Reverse proxy host (con placeholder CASTIFY_DOMAIN)
│   └── hls.conf                 # Servidor HLS interno (contenedor)
├── srs/srs.conf                 # Config SRS con hooks al servicio api
├── .env.prod.example            # Template de variables de entorno
└── scripts/
    └── deploy.sh                # Script de setup + deploy
```

---

## Resolución de problemas

### Los contenedores no levantan
```bash
docker compose -f docker-compose.prod.yml logs api
docker compose -f docker-compose.prod.yml logs web
```

### Recrear desde cero (cuidado: borra datos)
```bash
docker compose -f docker-compose.prod.yml down -v
./scripts/deploy.sh
```

### Actualizar solo un servicio
```bash
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
docker compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy
```
