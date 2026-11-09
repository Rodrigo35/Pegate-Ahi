'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';// Ajusta la ruta a tu cliente de Supabase

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
      .channel('queue-realtime')
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

  // Cliente que está actualmente en el sillón o siendo evaluado
  const clienteActual = cola.find((t) => t.status === 'in_service' || t.status === 'grace_period') || cola[0];

  // Lógica principal: Avanzar al siguiente cliente
  const handleSiguienteCliente = async () => {
    if (!clienteActual) return;

    try {
      // 1. SI EL CLIENTE ACTUAL ESTÁ EN DILIGENCIAS (GRACE PERIOD)
      if (clienteActual.status === 'grace_period') {
        // Obtenemos la posición más alta entre todos los turnos activos
        const maxPosicion = cola.reduce(
          (max, item) => (item.position > max ? item.position : max),
          0
        );
        const nuevaPosicion = maxPosicion + 1;

        // Lo mandamos al final de la cola y pasa a estado 'waiting'
        const { error: errorUpdate } = await supabase
          .from('queue')
          .update({
            position: nuevaPosicion,
            status: 'waiting',
            updated_at: new Date().toISOString(),
          })
          .eq('id', clienteActual.id);

        if (errorUpdate) throw errorUpdate;
      } 
      // 2. SI ES UN CLIENTE NORMAL (EN SILLÓN O EN ESPERA)
      else {
        const { error: errorComplete } = await supabase
          .from('queue')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', clienteActual.id);

        if (errorComplete) throw errorComplete;
      }

      // 3. PASAR AL SIGUIENTE EN ESPERA AL SILLÓN
      const restantesEnEspera = cola
        .filter((t) => t.id !== clienteActual.id && t.status === 'waiting')
        .sort((a, b) => a.position - b.position);

      if (restantesEnEspera.length > 0) {
        const siguienteEnLista = restantesEnEspera[0];
        await supabase
          .from('queue')
          .update({
            status: 'in_service',
            updated_at: new Date().toISOString(),
          })
          .eq('id', siguienteEnLista.id);
      }

      // Recargar la lista local
      await fetchCola();
    } catch (err) {
      console.error('Error al procesar el siguiente cliente:', err);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center">
      <h1 className="text-3xl font-extrabold mb-6">Panel del Barbero</h1>

      {cargando ? (
        <p className="text-gray-400">Cargando cola en tiempo real...</p>
      ) : (
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
          {/* TARJETA DEL CLIENTE ACTUAL */}
          <div className="mb-6 text-center">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
              Atendiendo / En Turno
            </span>
            {clienteActual ? (
              <div className="mt-2 p-4 bg-slate-900 rounded-xl border border-slate-700">
                <p className="text-2xl font-bold text-emerald-400">
                  {clienteActual.client_name}
                </p>
                <div className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase">
                  {clienteActual.status === 'grace_period' && (
                    <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md">
                      En diligencias (Tiempo de gracia)
                    </span>
                  )}
                  {clienteActual.status === 'in_service' && (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md">
                      En el sillón
                    </span>
                  )}
                  {clienteActual.status === 'waiting' && (
                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-md">
                      En espera (Turno #{clienteActual.position})
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 mt-2">No hay clientes en la cola.</p>
            )}
          </div>

          {/* BOTÓN DE ACCIÓN */}
          <button
            onClick={handleSiguienteCliente}
            disabled={!clienteActual}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-4 px-6 rounded-xl text-lg transition-all shadow-lg active:scale-95"
          >
            Siguiente Cliente
          </button>

          {/* LISTA DE ESPERA GENERAL */}
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
              Clientes en espera ({cola.filter((t) => t.status === 'waiting').length})
            </h2>
            <div className="space-y-2">
              {cola
                .filter((t) => t.status === 'waiting')
                .map((turno) => (
                  <div
                    key={turno.id}
                    className="flex justify-between items-center p-3 bg-slate-900 rounded-lg border border-slate-800"
                  >
                    <span className="font-medium text-slate-200">
                      {turno.client_name}
                    </span>
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded">
                      Posición #{turno.position}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
