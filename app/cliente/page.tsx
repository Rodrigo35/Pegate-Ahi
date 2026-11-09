'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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
  const [mostrarModal, setMostrarModal] = useState<boolean>(false);
  const [mensajeModal, setMensajeModal] = useState<string>('');

  const estadoAnterior = useRef<string | null>(null);

  const clienteTurnoId = typeof window !== 'undefined' ? localStorage.getItem('mi_turno_id') : null;

  // REPRODUCIR SONIDO DE ALERTA (Web Audio API)
  const reproducirSonidoAlerta = () => {
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.2); // A5
      gain2.gain.setValueAtTime(0.4, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.2);
      osc2.stop(now + 0.8);
    } catch (e) {
      console.log('Error al reproducir audio:', e);
    }
  };

  const fetchEstadoTurno = async () => {
    if (!clienteTurnoId) {
      setCargando(false);
      return;
    }

    try {
      const { data: turno, error: errorTurno } = await supabase
        .from('queue')
        .select('*')
        .eq('id', clienteTurnoId)
        .single();

      if (errorTurno) throw errorTurno;

      // NOTIFICACIONES Y MODAL SEGÚN CAMBIO DE ESTADO
      if (turno) {
        if (estadoAnterior.current && estadoAnterior.current !== turno.status) {
          if (turno.status === 'in_service') {
            reproducirSonidoAlerta();
            setMensajeModal('¡Es tu turno! Pasa al sillón de atención ✂️');
            setMostrarModal(true);
          } else if (turno.status === 'waiting' && estadoAnterior.current === 'grace_period') {
            reproducirSonidoAlerta();
            setMensajeModal('Tu turno ha sido reubicado al final de la cola por no estar presente.');
            setMostrarModal(true);
          }
        }
        estadoAnterior.current = turno.status;
      }

      setMiTurno(turno);

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

    const channel = supabase
      .channel('cliente-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue' },
        () => {
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
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-between p-6 relative">
      {/* VENTANA EMERGENTE (MODAL) */}
      {mostrarModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl space-y-4">
            <div className="text-5xl animate-bounce">🔔</div>
            <h3 className="text-2xl font-black text-white">¡Atención!</h3>
            <p className="text-slate-200 font-medium text-base">{mensajeModal}</p>
            <button
              onClick={() => setMostrarModal(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-3 rounded-xl transition-all shadow-lg active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* CABECERA */}
      <header className="w-full max-w-md text-center pt-4">
        <h1 className="text-xl font-extrabold tracking-wider uppercase text-emerald-400">Pégate Ahí</h1>
        <p className="text-xs text-slate-400 mt-1">Tu turno en tiempo real</p>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center my-auto">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Cliente</p>
        <h2 className="text-3xl font-black text-white mb-6">{miTurno.client_name}</h2>

        {miTurno.status === 'in_service' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
            <span className="text-4xl">✂️</span>
            <h3 className="text-xl font-black text-emerald-400 mt-2">¡Es tu turno!</h3>
            <p className="text-sm text-slate-300 mt-1">Pasa al sillón de atención.</p>
          </div>
        )}

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

        {miTurno.status === 'grace_period' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
            <span className="text-4xl">⏳</span>
            <h3 className="text-lg font-bold text-amber-400 mt-2">En ventana de gracia</h3>
            <p className="text-xs text-slate-300 mt-1">
              Si no estás en la barbería cuando te llamen, pasarás al final de la cola.
            </p>
          </div>
        )}

        {miTurno.status === 'completed' && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6">
            <span className="text-4xl">✅</span>
            <h3 className="text-xl font-bold text-blue-400 mt-2">Corte completado</h3>
            <p className="text-sm text-slate-300 mt-1">¡Gracias por tu preferencia!</p>
          </div>
        )}
      </div>

      <footer className="w-full max-w-md text-center text-xs text-slate-500 pb-2">
        La pantalla se actualiza en tiempo real automáticamente.
      </footer>
    </main>
  );
}
