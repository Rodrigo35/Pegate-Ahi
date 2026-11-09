'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Ajusta la ruta a tu cliente de Supabase

interface Turno {
  id: string;
  store_id: string;
  client_name: string;
  position: number;
  status: 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'grace_period';
  estimated_wait_minutes?: number;
}

export default function ClientePage() {
  const [miTurno, setMiTurno] = useState<Turno | null>(null);
  const [turnosDelante, setTurnosDelante] = useState<number>(0);
  const [cargando, setCargando] = useState<boolean>(true);

  // Reemplaza esto con la lógica con la que guardas/obtienes el ID del turno del cliente (localStorage, query param, etc.)
  const clienteTurnoId = typeof window !== 'undefined' ? localStorage.getItem('mi_turno_id') : null;

  const fetchEstadoTurno = async () => {
    if (!clienteTurnoId) {
      setCargando(false);
      return;
    }

    try {
      // 1. Obtener la información del turno del cliente actual
      const { data: turno, error: errorTurno } = await supabase
        .from('queue')
        .select('*')
        .eq('id', clienteTurnoId)
        .single();

      if (errorTurno) throw errorTurno;
      setMiTurno(turno);

      // 2. Si el cliente está esperando, contar cuántos turnos activos hay por delante de él
      if (turno && (turno.status === 'waiting' || turno.status === 'grace_period')) {
        const { count, error: errorCount } = await supabase
          .from('queue')
          .select('*', { count: 'exact', head: true })
          .in('status', ['waiting', 'in_service', 'grace_period'])
          .lt('position', turno.position);

        if (!errorCount) {
          setTurnosDelante(count || 0);
        }
      }
    } catch (err) {
      console.error('Error al obtener el turno del cliente:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    fetchEstadoTurno();

    // SUSCRIPCIÓN REALTIME: Escucha cualquier actualización en la tabla queue
    const channel = supabase
      .channel('cliente-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // Escucha INSERT, UPDATE y DELETE
          schema: 'public',
          table: 'queue',
        },
        () => {
          // Recargar el turno y la posición actual en la cola automáticamente
          fetchEstadoTurno();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clienteTurnoId]);

  if (cargando) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <p className="text-slate-400 animate-pulse font-medium">Actualizando estado del turno...</p>
      </main>
    );
  }

  if (!miTurno) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">No tienes un turno activo</h1>
        <p className="text-slate-400 text-sm max-w-xs">
          Escanea el código QR en la barbería o solicita tu turno para comenzar.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-6">
      {/* CABECERA */}
      <header className="w-full max-w-md text-center pt-4">
        <h1 className="text-xl font-extrabold tracking-wider uppercase text-emerald-400">Pégate Ahí</h1>
        <p className="text-xs text-slate-400 mt-1">Tu turno en tiempo real</p>
      </header>

      {/* CONTENIDO PRINCIPAL SEGÚN EL ESTADO */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center my-auto">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
        <h2 className="text-3xl font-black text-white mb-6">{miTurno.client_name}</h2>

        {/* ESTADO: EN EL SILLÓN */}
        {miTurno.status === 'in_service' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
            <span className="text-4xl">✂️</span>
            <h3 className="text-xl font-black text-emerald-400 mt-2">¡Es tu turno!</h3>
            <p className="text-sm text-slate-300 mt-1">Pasa al sillón de atención.</p>
          </div>
        )}

        {/* ESTADO: EN ESPERA */}
        {miTurno.status === 'waiting' && (
          <div className="space-y-4">
            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Tu posición en la cola</span>
              <p className="text-5xl font-black text-white mt-1">#{miTurno.position}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">Personas delante</p>
                <p className="text-xl font-bold text-slate-200 mt-1">{turnosDelante}</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400">Tiempo aprox.</p>
                <p className="text-xl font-bold text-slate-200 mt-1">
                  ~{turnosDelante * (miTurno.estimated_wait_minutes || 15)} min
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ESTADO: EN DILIGENCIAS / GRACE PERIOD */}
        {miTurno.status === 'grace_period' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
            <span className="text-4xl">⏳</span>
            <h3 className="text-lg font-bold text-amber-400 mt-2">En ventana de gracia</h3>
            <p className="text-xs text-slate-300 mt-1">
              Si no estás en la barbería cuando sea tu turno, pasarás al final de la cola.
            </p>
          </div>
        )}

        {/* ESTADO: COMPLETADO */}
        {miTurno.status === 'completed' && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6">
            <span className="text-4xl">✅</span>
            <h3 className="text-xl font-bold text-blue-400 mt-2">Corte completado</h3>
            <p className="text-sm text-slate-300 mt-1">¡Gracias por tu preferencia!</p>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <footer className="w-full max-w-md text-center text-xs text-slate-500 pb-2">
        La pantalla se actualiza en tiempo real automáticamente.
      </footer>
    </main>
  );
}
