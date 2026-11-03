'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Turno {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  estado: 'espera' | 'atendiendo' | 'finalizado';
  creado_en: string;
}

export default function BarberoView() {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Cargar turnos iniciales y escuchar cambios en tiempo real
  useEffect(() => {
    fetchTurnos();

    const channel = supabase
      .channel('barbero_turnos')
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

  const fetchTurnos = async () => {
    const { data, error } = await supabase
      .from('turnos')
      .select('*')
      .in('estado', ['espera', 'atendiendo'])
      .order('creado_en', { ascending: true });

    if (!error && data) {
      setTurnos(data as Turno[]);
    }
    setLoading(false);
  };

  const cambiarEstado = async (id: string, nuevoEstado: 'atendiendo' | 'finalizado') => {
    await supabase
      .from('turnos')
      .update({ estado: nuevoEstado })
      .eq('id', id);
    
    fetchTurnos();
  };

  const turnoActual = turnos.find((t) => t.estado === 'atendiendo');
  const colaEspera = turnos.filter((t) => t.estado === 'espera');

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header Barbero */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-amber-500">Panel del Barbero</h1>
            <p className="text-xs text-slate-400">Pégate Ahí — Gestión de Turnos</p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-full">
            ● En Línea
          </span>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-10 animate-pulse">Cargando cola de turnos...</p>
        ) : (
          <>
            {/* Cliente Actual en Silla */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-4">Atendiendo Ahora</h2>
              {turnoActual ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
                  <div>
                    <span className="text-3xl font-extrabold text-amber-400">{turnoActual.codigo_ticket}</span>
                    <p className="text-lg font-semibold text-white mt-1">{turnoActual.nombre_cliente || 'Cliente'}</p>
                  </div>
                  <button
                    onClick={() => cambiarEstado(turnoActual.id, 'finalizado')}
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95"
                  >
                    Finalizar Corte
                  </button>
                </div>
              ) : (
                <p className="text-slate-500 text-sm italic py-4 text-center">No hay nadie en la silla en este momento.</p>
              )}
            </section>

            {/* Cola de Espera */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-4">
                En Espera ({colaEspera.length})
              </h2>

              {colaEspera.length === 0 ? (
                <p className="text-slate-500 text-sm italic py-4 text-center">No hay clientes esperando en cola.</p>
              ) : (
                <div className="space-y-3">
                  {colaEspera.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-slate-800/40 border border-slate-800 p-4 rounded-xl hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 font-bold">#{index + 1}</span>
                        <div>
                          <p className="font-bold text-amber-400">{item.codigo_ticket}</p>
                          <p className="text-sm text-slate-300">{item.nombre_cliente || 'Cliente sin nombre'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => cambiarEstado(item.id, 'atendiendo')}
                        disabled={!!turnoActual}
                        className={`px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                          turnoActual
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95'
                        }`}
                      >
                        Llamar a Silla
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
