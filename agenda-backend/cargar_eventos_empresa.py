"""
Script de carga de eventos de empresa (cumpleaños, festivos, eventos) desde
un archivo CSV o Excel (.xlsx), detectado por extensión.

Detecta la fila de encabezado automáticamente (tolera filas de título o
columnas vacías antes, como suelen traer los Excel exportados a mano) y
reconoce alias comunes de columna: "nombre"; "fecha"/"cumpleaños"/
"cumpleanos"/"fecha de nacimiento" para la fecha; "tipo" es opcional — si
el archivo no lo trae (ej. una lista que es solo de cumpleaños), se usa el
segundo argumento de línea de comandos como tipo por defecto para todas
las filas.

  - tipo: cumpleanos | festivo | evento
  - fecha: YYYY-MM-DD, o una fecha real de Excel (se detecta sola)

Uso:
    python cargar_eventos_empresa.py ruta/al/archivo.csv
    python cargar_eventos_empresa.py ruta/al/archivo.xlsx
    python cargar_eventos_empresa.py ruta/al/archivo.xlsx cumpleanos

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

ALIAS_COLUMNAS = {
    "nombre": {"nombre"},
    "fecha": {"fecha", "cumpleanos", "cumpleaños", "fecha de nacimiento"},
    "tipo": {"tipo"},
}


def _normalizar(valor) -> str:
    return str(valor).strip().lower() if valor is not None else ""


def _mapear_encabezados(fila) -> dict:
    mapa = {}
    for i, valor in enumerate(fila):
        norm = _normalizar(valor)
        for campo, alias in ALIAS_COLUMNAS.items():
            if norm in alias:
                mapa[campo] = i
    return mapa


def _filas_normalizadas(filas_crudas):
    """Recibe un iterable de filas (listas/tuplas) — busca la primera fila
    que tenga columnas reconocibles de nombre+fecha (ignorando filas de
    título o vacías antes) y de ahí en adelante genera dicts
    {"nombre":..., "fecha":..., "tipo": ... (si vino en el archivo)}."""
    mapa = None
    for fila in filas_crudas:
        if mapa is None:
            candidato = _mapear_encabezados(fila)
            if "nombre" in candidato and "fecha" in candidato:
                mapa = candidato
            continue
        if not any(fila):
            continue
        nombre = fila[mapa["nombre"]]
        fecha = fila[mapa["fecha"]]
        if nombre is None or fecha is None:
            continue
        resultado = {"nombre": nombre, "fecha": fecha}
        if "tipo" in mapa:
            resultado["tipo"] = fila[mapa["tipo"]]
        yield resultado

    if mapa is None:
        raise ValueError(
            "No se encontró una fila de encabezado con columnas de nombre y fecha "
            "(alias reconocidos: " + ", ".join(sorted(ALIAS_COLUMNAS["fecha"])) + ")."
        )


def _leer_csv(ruta: Path):
    with ruta.open(encoding="utf-8-sig", newline="") as f:
        yield from _filas_normalizadas(csv.reader(f))


def _leer_xlsx(ruta: Path):
    import openpyxl  # import perezoso: solo hace falta si se usa un .xlsx

    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    hoja = wb.active
    yield from _filas_normalizadas(hoja.iter_rows(values_only=True))


def _parsear_fecha(valor) -> datetime.date:
    if hasattr(valor, "date"):
        return valor.date()
    if hasattr(valor, "year") and not isinstance(valor, str):
        return valor
    return datetime.strptime(str(valor).strip(), "%Y-%m-%d").date()


def cargar(ruta_str: str, tipo_defecto: str | None = None):
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
            tipo_valor = fila.get("tipo") or tipo_defecto
            if not tipo_valor:
                print(
                    f'Fila de "{nombre}" no trae columna "tipo" y no diste un tipo por defecto. '
                    "Usa: python cargar_eventos_empresa.py archivo tipo_defecto"
                )
                sys.exit(1)
            tipo = TipoEventoEmpresa(str(tipo_valor).strip().lower())
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
    if len(sys.argv) not in (2, 3):
        print("Uso: python cargar_eventos_empresa.py ruta/al/archivo.csv|.xlsx [tipo_defecto]")
        sys.exit(1)
    cargar(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None)
