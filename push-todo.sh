#!/bin/bash
# Empuja los cambios de agenda-nueva a GitHub (origin) y al repo local de la Pi (pi-local)
set -e
cd /home/yue/agenda-nueva

echo "--- Push a GitHub (origin) ---"
git push origin master

echo "--- Push al repo local de la Pi (pi-local) ---"
git push pi-local master

echo "Listo: ambos remotos actualizados."
