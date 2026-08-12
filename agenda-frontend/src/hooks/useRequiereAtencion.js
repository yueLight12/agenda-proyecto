import { useCallback, useEffect, useState } from "react";
import { dashboardApi, eventosEmpresaApi } from "../api/endpoints";

// Mismos datos que antes armaba DashboardSimplificado.jsx para la tarjeta
// "Requiere tu atención" (ahora retirada del Dashboard) — se usa desde
// AppLayout.jsx para mostrarlos dentro del panel de Notificaciones,
// etiquetados como "Urgente".
export function useRequiereAtencion() {
  const [vencidos, setVencidos] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [reunionesHoy, setReunionesHoy] = useState([]);
  const [cumpleanosProximos, setCumpleanosProximos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(() => {
    Promise.all([dashboardApi.resumen(), eventosEmpresaApi.listar()])
      .then(([resumen, eventos]) => {
        setVencidos(resumen.entregables_atencion.filter((e) => e.urgencia === "vencido"));
        setProximos(resumen.entregables_atencion.filter((e) => e.urgencia === "proximo"));

        const hoy = new Date();
        setReunionesHoy(
          resumen.reuniones_proximas.filter((r) => {
            const fecha = new Date(r.fecha_inicio);
            return (
              fecha.getFullYear() === hoy.getFullYear() &&
              fecha.getMonth() === hoy.getMonth() &&
              fecha.getDate() === hoy.getDate()
            );
          })
        );

        const hoyMedianoche = new Date();
        hoyMedianoche.setHours(0, 0, 0, 0);
        const limite = new Date(hoyMedianoche);
        limite.setDate(limite.getDate() + 2);
        setCumpleanosProximos(
          eventos.filter((e) => {
            if (e.tipo !== "cumpleanos") return false;
            const [anio, mes, dia] = e.fecha.split("-").map(Number);
            const fecha = new Date(anio, mes - 1, dia);
            return fecha >= hoyMedianoche && fecha <= limite;
          })
        );
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const total = vencidos.length + proximos.length + reunionesHoy.length + cumpleanosProximos.length;

  return { vencidos, proximos, reunionesHoy, cumpleanosProximos, total, cargando, recargar };
}
