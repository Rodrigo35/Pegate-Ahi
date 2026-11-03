'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  estado: string;
  posicion_cola: number;
  barbero_nombre?: string;
}

export default function ClienteView() {
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Escuchar cambios en tiempo real si hay un turno activo
    const channel = supabase
      .channel('turnos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          console.log('Cambio en tiempo real:', payload);
        }
      )
      .subscribe();

    setLoading(false);

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-amber-500 mb-2">Pégate Ahí</h1>
        <p className="text-slate-400 text-sm mb-6">Barbería & Queue System</p>

        {loading ? (
          <p className="text-slate-400 animate-pulse">Cargando tu turno...</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50">
              <span className="text-xs uppercase tracking-wider text-slate-400">Estado del Turno</span>
              <p className="text-xl font-bold text-emerald-400 mt-1">En Espera</p>
            </div>
            
            <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <span className="text-xs text-amber-400 uppercase tracking-wider">Tu Código</span>
              <p className="text-4xl font-extrabold text-amber-400 mt-1">#A-01</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
