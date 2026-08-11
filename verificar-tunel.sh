#!/bin/bash
# Verifica que el túnel público (agenda-demo.usw3) esté sirviendo tráfico real
# de la app, y no un bloqueo de autenticación del propio relay de devtunnels.
# Correr antes de compartir el link con el cliente.

set -u

FRONTEND_URL="https://5xtz0906-5183.usw3.devtunnels.ms"
API_URL="https://5xtz0906-8010.usw3.devtunnels.ms"

echo "Verificando frontend: $FRONTEND_URL"
frontend_status=$(curl -sS -o /dev/null -w "%{http_code}" "$FRONTEND_URL/")
if [ "$frontend_status" != "200" ]; then
  echo "❌ Frontend respondió $frontend_status (se esperaba 200)."
  echo "   Revisa que 'devtunnel host agenda-demo.usw3' esté corriendo y que el contenedor 'web' esté arriba."
  exit 1
fi
echo "✅ Frontend OK (200)"

echo "Verificando API: $API_URL/proyectos"
api_body=$(curl -sS -o /tmp/verificar-tunel-body.txt -w "%{http_code}" "$API_URL/proyectos")
api_status="$api_body"
body_content=$(cat /tmp/verificar-tunel-body.txt 2>/dev/null || echo "")
rm -f /tmp/verificar-tunel-body.txt

if [ "$api_status" != "401" ]; then
  echo "❌ La API respondió $api_status (se esperaba 401 'Not authenticated' de FastAPI, sin token)."
  echo "   Revisa que el contenedor 'api' esté arriba y que 'devtunnel host agenda-demo.usw3' esté corriendo."
  exit 1
fi

if echo "$body_content" | grep -q "Not authenticated"; then
  echo "✅ API OK — la petición llegó hasta FastAPI (401 esperado por no mandar token)."
else
  echo "❌ El túnel devolvió 401 pero SIN el cuerpo esperado de FastAPI."
  echo "   Esto indica que el bloqueo viene del relay de devtunnels (falta acceso anónimo),"
  echo "   no de la app. Revisa 'devtunnel access list agenda-demo.usw3'."
  echo "   Cuerpo recibido: $body_content"
  exit 1
fi

echo ""
echo "✅ Túnel OK — listo para compartir: $FRONTEND_URL"
