FROM python:3.12-slim

WORKDIR /code

# Librerías de sistema requeridas por WeasyPrint (genera los PDF de
# reportes, ver app/services/reportes_pdf.py) -- sin esto, weasyprint
# truena al importar con un OSError de "cannot load library". El grupo
# libxml2-dev/libxmlsec1-dev/pkg-config/gcc es para el paquete `xmlsec`
# (dependencia de python3-saml, ver app/services/saml_sso.py) -- sus
# bindings de Python se compilan desde código C al hacer pip install, sin
# estas librerías de desarrollo la instalación truena.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libffi-dev \
    shared-mime-info fonts-dejavu-core \
    libxml2-dev libxmlsec1-dev libxmlsec1-openssl pkg-config gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
