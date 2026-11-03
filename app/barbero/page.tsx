'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Turno {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  tipo_corte: string;
  estado: 'espera' | 'atendiendo' | 'finalizado';
  creado_en: string;
}

export default function BarberoView() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [atendidosHoy, setAtendidosHoy] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTurnos = async () => {
    // 1. Cargar turnos activos (espera y atendiendo)
    const { data: activos, error: errorActivos } = await supabase
      .from('turnos')
      .select('*')
      .in('estado', ['espera', 'atendiendo'])
      .order('creado_en', { ascending: true });

    // 2. Contar total de atendidos/finalizados del día
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

    // Escuchar cambios en tiempo real
    const channel = supabase
      .channel('barbero_dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        () => {
          fetchTurnos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const turnoActual = turnos.find((t) => t.estado === 'atendiendo');
  const colaEspera = turnos.filter((t) => t.estado === 'espera');

  // Acción: Llamar al siguiente cliente disponible
  const llamarSiguiente = async () => {
    if (colaEspera.length === 0) return;
    const siguiente = colaEspera[0];

    await supabase
      .from('turnos')
      .update({ estado: 'atendiendo' })
      .eq('id', siguiente.id);

    fetchTurnos();
  };

  // Acción: Finalizar el servicio actual
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
          <span className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            En Línea
          </span>
        </div>

        {/* MÉTROLOGÍA / CUADROS CON NÚMEROS */}
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

        {/* TARJETA DEL CLIENTE ACTUAL */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-xs uppercase tracking-widest text-slate-400 font-bold">Cliente Actual en Silla</h2>
            {turnoActual && (
              <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded-md uppercase">
                Cortando ✂️
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-center text-slate-500 py-8 animate-pulse text-sm">Cargando información...</p>
          ) : turnoActual ? (
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-6 text-center space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Código de Turno</span>
              <p className="text-6xl font-black text-amber-400">{turnoActual.codigo_ticket}</p>
              
              <div className="pt-2">
                <p className="text-xl font-bold text-white">{turnoActual.nombre_cliente || 'Cliente sin nombre'}</p>
                <p className="text-sm font-medium text-amber-300/90 mt-1">
                  ✂️ Servicio: <span className="text-slate-200">{turnoActual.tipo_corte || 'Corte Normal'}</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-8 text-center">
              <p className="text-slate-500 text-sm font-medium">Silla libre. Presiona el botón para llamar al siguiente cliente.</p>
            </div>
          )}

          {/* BOTONES PRINCIPALES DE ACCIÓN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              onClick={llamarSiguiente}
              disabled={colaEspera.length === 0 || !!turnoActual}
              className={`w-full py-4 px-6 font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                colaEspera.length === 0 || !!turnoActual
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95 shadow-amber-500/10'
              }`}
            >
              📢 Llamar Siguiente Cliente
            </button>

            <button
              onClick={finalizarServicio}
              disabled={!turnoActual}
              className={`w-full py-4 px-6 font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                !turnoActual
                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-emerald-600/20'
              }`}
            >
              ✅ Finalizar Servicio
            </button>
          </div>
        </div>

        {/* LISTA EN ESPERA (VISTA RÁPIDA ABAJO) */}
        {colaEspera.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">
              Próximos en Lista ({colaEspera.length})
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {colaEspera.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-slate-800/30 border border-slate-800/80 px-4 py-3 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 font-bold">#{idx + 1}</span>
                    <span className="font-extrabold text-amber-400">{item.codigo_ticket}</span>
                    <span className="text-slate-300 font-medium">{item.nombre_cliente || 'Cliente'}</span>
                  </div>
                  <span className="text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
                    {item.tipo_corte || 'Corte Normal'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
