#!/bin/bash
# Reconstruye el stack completo tras un reinicio de la Studio de Lightning AI
# (pierde contenedores/imagenes/datos de Docker, pero el repo y los .env
# sobreviven porque estan en almacenamiento persistente). Uso:
#
#   ./recuperar-lightning.sh
#
# Corre esto DENTRO de la Studio (por SSH o desde su terminal), parado en
# la raiz del repo (agenda-proyecto/).

set -euo pipefail

DUMP=$(ls -t agenda_actualizado_*.sql 2>/dev/null | head -1)
if [ -z "$DUMP" ]; then
  echo "No encontre ningun agenda_actualizado_*.sql en esta carpeta."
  echo "Sube uno nuevo (scp) antes de correr este script, o ajusta la variable DUMP a mano."
  exit 1
fi
echo "Usando dump: $DUMP"

echo "== Reconstruyendo contenedores =="
docker compose up -d --build

echo "== Esperando a que Postgres acepte conexiones =="
for i in $(seq 1 30); do
  if docker exec agenda-proyecto-db-1 pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "== Restaurando base de datos ($DUMP) =="
docker exec -i agenda-proyecto-db-1 psql -U postgres -d agenda_inteligente < "$DUMP"

echo "== Creando/verificando usuario de demo publica =="
docker exec agenda-proyecto-api-1 python crear_usuario_demo_publico.py --ejecutar || true

echo "== Reiniciando API para tomar variables de entorno =="
docker restart agenda-proyecto-api-1
sleep 6

echo "== Verificando =="
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -s -o /dev/null -w 'backend (8010): %{http_code}\n' http://localhost:8010/docs
curl -s -o /dev/null -w 'frontend (5183): %{http_code}\n' http://localhost:5183

echo "Listo."
