'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Turno {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono?: string;
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
      .select('*')
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

    // Abrir WhatsApp automáticamente si el cliente dejó su número y estaba fuera
    if (siguiente.cliente_telefono) {
      enviarWhatsApp(siguiente.cliente_telefono, siguiente.nombre_cliente, siguiente.codigo_ticket);
    }

    fetchTurnos();
  };

  const enviarWhatsApp = (telefono: string, nombre: string, ticket: string) => {
    let numLimpio = telefono.replace(/\D/g, '');
    if (numLimpio.startsWith('0')) {
      numLimpio = '58' + numLimpio.substring(1);
    }
    const mensaje = encodeURIComponent(
      `¡Hola ${nombre}! ✂️ Tu turno ${ticket} ha sido llamado en Pégate Ahí. Dispones de 30 minutos para llegar al local.`
    );
    window.open(`https://wa.me/${numLimpio}?text=${mensaje}`, '_blank');
  };

  const pasarSiguientePorAusencia = async () => {
    if (!turnoActual) return;
    await supabase.from('turnos').update({ estado: 'ausente' }).eq('id', turnoActual.id);
    if (colaEspera.length > 0) {
      await supabase.from('turnos').update({ estado: 'atendiendo', llamado_en: new Date().toISOString() }).eq('id', colaEspera[0].id);
    }
    fetchTurnos();
  };

  const finalizarServicio = async () => {
    if (!turnoActual) return;
    await supabase.from('turnos').update({ estado: 'finalizado' }).eq('id', turnoActual.id);
    fetchTurnos();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-amber-500">PÉGATE AHÍ</h1>
            <p className="text-xs text-slate-400">Control de Barbería & Turnos</p>
          </div>
          <div className="font-mono text-sm text-amber-400 font-bold">{horaActual}</div>
        </div>

        {/* Cliente Actual */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
          <h2 className="text-xs uppercase text-slate-400 font-bold">Cliente Actual en Silla / Llamado</h2>

          {turnoActual ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center space-y-3">
              <p className="text-6xl font-black text-amber-400">{turnoActual.codigo_ticket}</p>
              <p className="text-2xl font-bold text-white">{turnoActual.nombre_cliente}</p>

              {/* Botón rápido WhatsApp si el cliente dejó su número */}
              {turnoActual.cliente_telefono && (
                <button
                  onClick={() => enviarWhatsApp(turnoActual.cliente_telefono!, turnoActual.nombre_cliente, turnoActual.codigo_ticket)}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all"
                >
                  📲 Notificar por WhatsApp ({turnoActual.cliente_telefono})
                </button>
              )}

              {turnoActual.modalidad_espera === 'diligencia' && minutosRestantes !== null && (
                <div className="p-3 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-center text-indigo-300">
                  <p className="text-xs font-bold uppercase">Tiempo restante para llegar</p>
                  <p className="text-3xl font-black font-mono mt-1">{minutosRestantes} min</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
              Silla libre. Presiona "Llamar Siguiente Cliente" para atender.
            </div>
          )}

          {/* Botones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {!turnoActual ? (
              <button
                onClick={llamarSiguiente}
                disabled={colaEspera.length === 0}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl disabled:opacity-50"
              >
                📢 Llamar Siguiente Cliente
              </button>
            ) : (
              <>
                {turnoActual.modalidad_espera === 'diligencia' && (
                  <button
                    onClick={pasarSiguientePorAusencia}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase rounded-xl"
                  >
                    🚫 Ausente (Pasar Siguiente)
                  </button>
                )}
                <button
                  onClick={finalizarServicio}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl"
                >
                  ✅ Finalizar Servicio
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
