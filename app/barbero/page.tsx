'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Turno {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  llamado_en?: string;
  creado_en: string;
}

export default function BarberoView() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [atendidosHoy, setAtendidosHoy] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [horaActual, setHoraActual] = useState<string>('');
  const [minutosRestantes, setMinutosRestantes] = useState<number | null>(null);

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchTurnos = async () => {
    const { data: activos, error: errorActivos } = await supabase
      .from('turnos')
      .select('id, codigo_ticket, nombre_cliente, tipo_corte, monto, modalidad_espera, estado, llamado_en, creado_en')
      .in('estado', ['espera', 'atendiendo'])
      .order('creado_en', { ascending: true });

    const { count } = await supabase
      .from('turnos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'finalizado');

    if (!errorActivos && activos) {
      setTurnos(activos as Turno[]);
    }
    setAtendidosHoy(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchTurnos();
    const channel = supabase
      .channel('barbero_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        fetchTurnos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const turnoActual = turnos.find((t) => t.estado === 'atendiendo');
  const colaEspera = turnos.filter((t) => t.estado === 'espera');

  // Control del temporizador de 30 minutos para el cliente llamado que estaba fuera
  useEffect(() => {
    if (turnoActual && turnoActual.modalidad_espera === 'diligencia' && turnoActual.llamado_en) {
      const interval = setInterval(() => {
        const horaLlamado = new Date(turnoActual.llamado_en!).getTime();
        const ahora = new Date().getTime();
        const transcurridoMin = Math.floor((ahora - horaLlamado) / 60000);
        const restante = 30 - transcurridoMin;

        setMinutosRestantes(restante > 0 ? restante : 0);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setMinutosRestantes(null);
    }
  }, [turnoActual]);

  const llamarSiguiente = async () => {
    if (colaEspera.length === 0) return;
    const siguiente = colaEspera[0];

    await supabase
      .from('turnos')
      .update({
        estado: 'atendiendo',
        llamado_en: new Date().toISOString(),
      })
      .eq('id', siguiente.id);

    fetchTurnos();
  };

  const pasarSiguientePorAusencia = async () => {
    if (!turnoActual) return;

    // Cambiar estado del turno actual a ausente / reubicado
    await supabase
      .from('turnos')
      .update({ estado: 'ausente' })
      .eq('id', turnoActual.id);

    // Llamar de inmediato al siguiente de la cola si hay
    if (colaEspera.length > 0) {
      await supabase
        .from('turnos')
        .update({
          estado: 'atendiendo',
          llamado_en: new Date().toISOString(),
        })
        .eq('id', colaEspera[0].id);
    }

    fetchTurnos();
  };

  const finalizarServicio = async () => {
    if (!turnoActual) return;

    await supabase
      .from('turnos')
      .update({ estado: 'finalizado' })
      .eq('id', turnoActual.id);

    fetchTurnos();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-amber-500 tracking-wide">PÉGATE AHÍ</h1>
            <p className="text-xs text-slate-400">Control de Barbería & Turnos</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Hora Servidor</span>
              <span className="text-sm font-mono font-bold text-amber-400">{horaActual}</span>
            </div>
            <span className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              En Línea
            </span>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center shadow-lg">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">En Espera</span>
            <p className="text-4xl font-extrabold text-amber-400 mt-2">{colaEspera.length}</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center shadow-lg">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">Atendidos Hoy</span>
            <p className="text-4xl font-extrabold text-emerald-400 mt-2">{atendidosHoy}</p>
          </div>
        </div>

        {/* Cliente Actual */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-xs uppercase tracking-widest text-slate-400 font-bold">Cliente Llamado / En Silla</h2>
            {turnoActual && (
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded-md uppercase">
                {turnoActual.modalidad_espera === 'diligencia' ? 'Esperando Llegada ⏳' : 'En Silla ✂️'}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-center text-slate-500 py-8 animate-pulse text-sm">Cargando información...</p>
          ) : turnoActual ? (
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 text-center space-y-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Turno Asignado</span>
              <p className="text-6xl font-black text-amber-400">{turnoActual.codigo_ticket}</p>
              
              <div>
                <p className="text-2xl font-bold text-white">{turnoActual.nombre_cliente}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-sm font-semibold">
                    ✂️ Servicio: <span className="text-white">{turnoActual.tipo_corte}</span> (${turnoActual.monto})
                  </span>
                  <span className={`px-3 py-1 border rounded-lg text-sm font-semibold ${
                    turnoActual.modalidad_espera === 'diligencia'
                      ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                      : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                  }`}>
                    {turnoActual.modalidad_espera === 'diligencia' ? '🏃‍♂️ Estaba fuera (Diligencias)' : '💈 Estaba en el local'}
                  </span>
                </div>
              </div>

              {/* Temporizador de 30 Minutos si el cliente estaba fuera */}
              {turnoActual.modalidad_espera === 'diligencia' && minutosRestantes !== null && (
                <div className={`p-4 rounded-xl border text-center ${
                  minutosRestantes === 0
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                }`}>
                  <p className="text-xs font-bold uppercase tracking-wider">Tiempo límite para presentarse</p>
                  <p className="text-3xl font-black font-mono mt-1">
                    {minutosRestantes > 0 ? `${minutosRestantes} min` : '⏱️ ¡TIEMPO AGOTADO!'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-8 text-center">
              <p className="text-slate-500 text-sm font-medium">Silla libre. Presiona "Llamar Siguiente Cliente" para atender.</p>
            </div>
          )}

          {/* Botones de Control */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {!turnoActual ? (
              <button
                onClick={llamarSiguiente}
                disabled={colaEspera.length === 0}
                className={`w-full py-4 px-6 font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                  colaEspera.length === 0
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95'
                }`}
              >
                📢 Llamar Siguiente Cliente
              </button>
            ) : (
              <>
                {turnoActual.modalidad_espera === 'diligencia' && (
                  <button
                    onClick={pasarSiguientePorAusencia}
                    className="w-full py-4 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-lg shadow-rose-600/20"
                  >
                    🚫 Ausente (Pasar Siguiente)
                  </button>
                )}

                <button
                  onClick={finalizarServicio}
                  className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
                >
                  ✅ Finalizar Servicio
                </button>
              </>
            )}
          </div>
        </div>

        {/* Lista de Espera */}
        {colaEspera.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">
              Próximos en Cola ({colaEspera.length})
            </h3>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {colaEspera.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-slate-800/40 border border-slate-800 px-4 py-3 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-bold">#{idx + 1}</span>
                    <span className="font-extrabold text-amber-400 text-sm">{item.codigo_ticket}</span>
                    <span className="text-white font-bold text-sm">{item.nombre_cliente}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md font-semibold ${
                      item.modalidad_espera === 'diligencia'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {item.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera' : '💈 En local'}
                    </span>

                    <span className="text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md font-medium">
                      {item.tipo_corte || 'Corte clásico'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
