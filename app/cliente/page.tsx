'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface Turno {
  id: string;
  store_id: string;
  client_name: string;
  client_phone?: string;
  position: number;
  status: 'waiting' | 'in_service' | 'completed' | 'cancelled' | 'grace_period';
  created_at?: string;
}

export default function BarberoPage() {
  const [cola, setCola] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);

  // Cargar cola inicial y suscribirse a cambios en tiempo real
  useEffect(() => {
    fetchCola();

    const channel = supabase
      .channel('queue-realtime-barbero')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue' },
        () => {
          fetchCola();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCola = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('queue')
      .select('*')
      .in('status', ['waiting', 'in_service', 'grace_period'])
      .order('position', { ascending: true });

    if (error) {
      console.error('Error al obtener la cola:', error);
    } else {
      setCola(data || []);
    }
    setCargando(false);
  };

  // Identificar quién está en atención o en gracia en la vista actual
  const clienteEnSillon = cola.find((t) => t.status === 'in_service');
  const clienteEnGracia = cola.find((t) => t.status === 'grace_period');
  const clienteActual = clienteEnSillon || clienteEnGracia || cola[0];

  // FUNCIÓN CORREGIDA: Avanzar la cola reubicando al cliente en gracia al final
  const handleSiguienteCliente = async () => {
    try {
      // 1. Obtener los datos frescos directamente de Supabase para evitar desfases de estado
      const { data: queueData, error: fetchError } = await supabase
        .from('queue')
        .select('*')
        .in('status', ['waiting', 'in_service', 'grace_period'])
        .order('position', { ascending: true });

      if (fetchError || !queueData || queueData.length === 0) return;

      const enSillon = queueData.find((t) => t.status === 'in_service');
      const enGracia = queueData.find((t) => t.status === 'grace_period');

      // CASO A: Si hay alguien en el sillón, se completa su turno
      if (enSillon) {
        await supabase
          .from('queue')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', enSillon.id);
      }

      // CASO B: Si el turno actual está en diligencias (grace_period), MOVER AL FINAL
      if (enGracia) {
        const maxPosition = queueData.reduce(
          (max, item) => (item.position > max ? item.position : max),
          0
        );
        const nuevaPosicion = maxPosition + 1;

        // Cambia a 'waiting' (apaga contador de 30 min) y lo envía al final de la fila
        await supabase
          .from('queue')
          .update({
            position: nuevaPosicion,
            status: 'waiting',
            updated_at: new Date().toISOString(),
          })
          .eq('id', enGracia.id);
      }

      // CASO C: Si no había enSillon ni enGracia pero hay un cliente en 'waiting' al frente
      if (!enSillon && !enGracia && queueData.length > 0) {
        const primeroEnEspera = queueData.find((t) => t.status === 'waiting');
        if (primeroEnEspera) {
          await supabase
            .from('queue')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', primeroEnEspera.id);
        }
      }

      // 2. PASAR AL SIGUIENTE CLIENTE DISPONIBLE AL SILLÓN ('in_service')
      const siguientesDisponibles = queueData
        .filter(
          (t) =>
            t.status === 'waiting' &&
            t.id !== enGracia?.id // Excluye al que acabamos de mandar al final
        )
        .sort((a, b) => a.position - b.position);

      if (siguientesDisponibles.length > 0) {
        const siguienteTurno = siguientesDisponibles[0];
        await supabase
          .from('queue')
          .update({
            status: 'in_service',
            updated_at: new Date().toISOString(),
          })
          .eq('id', siguienteTurno.id);
      }

      // Recargar cola local
      await fetchCola();
    } catch (err) {
      console.error('Error al procesar el siguiente cliente:', err);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center">
      <header className="w-full max-w-md text-center mb-6">
        <h1 className="text-3xl font-black text-emerald-400">Pégate Ahí</h1>
        <p className="text-xs text-slate-400 mt-1">Panel de Control del Barbero</p>
      </header>

      {cargando && cola.length === 0 ? (
        <p className="text-slate-400 animate-pulse">Cargando cola en tiempo real...</p>
      ) : (
        <div className="w-full max-w-md bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800">
          {/* TARJETA DEL CLIENTE EN ATENCIÓN O GRACIA */}
          <div className="mb-6 text-center">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">
              Turno en Gestión
            </span>

            {clienteActual ? (
              <div className="mt-3 p-5 bg-slate-950 rounded-2xl border border-slate-800">
                <p className="text-2xl font-black text-white">
                  {clienteActual.client_name}
                </p>

                <div className="mt-3 inline-block">
                  {clienteActual.status === 'grace_period' && (
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      ⏳ En diligencias (Tiempo de gracia)
                    </span>
                  )}
                  {clienteActual.status === 'in_service' && (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      ✂️ En el sillón
                    </span>
                  )}
                  {clienteActual.status === 'waiting' && (
                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      👤 Turno #{clienteActual.position}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 p-5 bg-slate-950 rounded-2xl border border-slate-800">
                <p className="text-slate-500 font-medium">No hay clientes en la cola.</p>
              </div>
            )}
          </div>

          {/* BOTÓN PRINCIPAL */}
          <button
            onClick={handleSiguienteCliente}
            disabled={!clienteActual}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black py-4 px-6 rounded-2xl text-lg transition-all shadow-lg active:scale-95"
          >
            Siguiente Cliente
          </button>

          {/* COLA DE ESPERA RESTANTE */}
          <div className="mt-8">
            <h2 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
              En lista de espera ({cola.filter((t) => t.status === 'waiting').length})
            </h2>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {cola
                .filter((t) => t.status === 'waiting')
                .map((turno) => (
                  <div
                    key={turno.id}
                    className="flex justify-between items-center p-3 bg-slate-950 rounded-xl border border-slate-800/80"
                  >
                    <span className="font-semibold text-slate-200 text-sm">
                      {turno.client_name}
                    </span>
                    <span className="text-xs bg-slate-800 text-emerald-400 font-bold px-2.5 py-1 rounded-lg">
                      #{turno.position}
                    </span>
                  </div>
                ))}

              {cola.filter((t) => t.status === 'waiting').length === 0 && (
                <p className="text-xs text-slate-600 text-center py-2">
                  No hay nadie esperando en lista.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
