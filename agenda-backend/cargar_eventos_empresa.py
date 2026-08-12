"""
Script de carga de eventos de empresa (cumpleaños, festivos, eventos) desde
un archivo CSV o Excel (.xlsx), detectado por extensión.

Columnas esperadas (encabezado en la primera fila): nombre, tipo, fecha
  - tipo: cumpleanos | festivo | evento
  - fecha: YYYY-MM-DD

Uso:
    python cargar_eventos_empresa.py ruta/al/archivo.csv
    python cargar_eventos_empresa.py ruta/al/archivo.xlsx

Idempotente: hace upsert por (nombre, tipo) — correrlo varias veces con el
mismo archivo actualiza en vez de duplicar (mismo criterio que seed.py).
"""
import csv
import sys
from datetime import datetime
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.models.evento_empresa import EventoEmpresa, TipoEventoEmpresa

Base.metadata.create_all(bind=engine)


def _leer_csv(ruta: Path):
    with ruta.open(encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def _leer_xlsx(ruta: Path):
    import openpyxl  # import perezoso: solo hace falta si se usa un .xlsx

    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    hoja = wb.active
    filas = hoja.iter_rows(values_only=True)
    encabezados = [str(h).strip().lower() for h in next(filas)]
    for fila in filas:
        if not any(fila):
            continue
        yield dict(zip(encabezados, fila))


def _parsear_fecha(valor) -> datetime.date:
    if hasattr(valor, "date"):
        return valor.date()
    if hasattr(valor, "year") and not isinstance(valor, str):
        return valor
    return datetime.strptime(str(valor).strip(), "%Y-%m-%d").date()


def cargar(ruta_str: str):
    ruta = Path(ruta_str)
    if not ruta.exists():
        print(f"No se encontró el archivo: {ruta}")
        sys.exit(1)

    if ruta.suffix.lower() == ".csv":
        filas = _leer_csv(ruta)
    elif ruta.suffix.lower() == ".xlsx":
        filas = _leer_xlsx(ruta)
    else:
        print("Formato no soportado — usa .csv o .xlsx")
        sys.exit(1)

    db = SessionLocal()
    creados = 0
    actualizados = 0
    try:
        for fila in filas:
            nombre = str(fila["nombre"]).strip()
            tipo = TipoEventoEmpresa(str(fila["tipo"]).strip().lower())
            fecha = _parsear_fecha(fila["fecha"])

            existente = (
                db.query(EventoEmpresa)
                .filter(EventoEmpresa.nombre == nombre, EventoEmpresa.tipo == tipo)
                .first()
            )
            if existente:
                existente.fecha = fecha
                actualizados += 1
            else:
                db.add(EventoEmpresa(nombre=nombre, tipo=tipo, fecha=fecha))
                creados += 1

        db.commit()
    finally:
        db.close()

    print(f"Listo — creados={creados}, actualizados={actualizados}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python cargar_eventos_empresa.py ruta/al/archivo.csv|.xlsx")
        sys.exit(1)
    cargar(sys.argv[1])
