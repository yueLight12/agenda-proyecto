import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { entregablesApi } from "../api/endpoints";
import Modal from "./Modal";

export default function ModalHistorial({ entregable, miembros, onCerrar }) {
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    entregablesApi
      .historial(entregable.id)
      .then((datos) =>
        setHistorial(
          datos.map((registro) => ({
            ...registro,
            fecha: new Date(registro.fecha_registro).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
            }),
          }))
        )
      )
      .catch(() => setError("No se pudo cargar el histórico de avance."))
      .finally(() => setCargando(false));
  }, [entregable.id]);

  const nombreDe = (usuarioId) =>
    miembros.find((m) => m.usuario_id === usuarioId)?.nombre || `Usuario #${usuarioId}`;

  return (
    <Modal titulo={`Histórico de avance — ${entregable.nombre}`} onCerrar={onCerrar}>
      {cargando && <p>Cargando histórico...</p>}
      {error && <p className="error-text">{error}</p>}

      {!cargando && !error && historial.length === 0 && (
        <p style={{ color: "var(--color-text-muted)" }}>
          Todavía no hay registros de avance para este entregable.
        </p>
      )}

      {!cargando && !error && historial.length > 0 && (
        <>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={historial} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                <Tooltip formatter={(valor) => [`${valor}%`, "Avance"]} />
                <Line
                  type="monotone"
                  dataKey="porcentaje_avance"
                  stroke="var(--color-teal-500)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="table-responsive" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Avance</th>
                <th>Actualizado por</th>
              </tr>
            </thead>
            <tbody>
              {historial
                .slice()
                .reverse()
                .map((registro) => (
                  <tr key={registro.id}>
                    <td>{registro.fecha}</td>
                    <td>{registro.porcentaje_avance}%</td>
                    <td>{nombreDe(registro.actualizado_por)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Modal>
  );
}
