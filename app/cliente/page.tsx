'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  estado: 'espera' | 'atendiendo' | 'finalizado';
  creado_en: string;
}

function ClienteContent() {
  const searchParams = useSearchParams();
  const turnoId = searchParams.get('id');
  const ticketParam = searchParams.get('ticket');

  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargarDatosTurno = async () => {
    if (!turnoId && !ticketParam) {
      setLoading(false);
      return;
    }

    // 1. Obtener el turno específico
    let query = supabase.from('turnos').select('*');
    if (turnoId) {
      query = query.eq('id', turnoId);
    } else if (ticketParam) {
      query = query.eq('codigo_ticket', ticketParam.toUpperCase());
    }

    const { data: miTurno, error } = await query.single();

    if (error || !miTurno) {
      setErrorMsg('No encontramos tu turno. Verifica el enlace o código.');
      setLoading(false);
      return;
    }

    setTurno(miTurno as TurnoCliente);

    // 2. Si está en espera, calcular cuántos van antes
    if (miTurno.estado === 'espera') {
      const { count } = await supabase
        .from('turnos')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'espera')
        .lt('creado_en', miTurno.creado_en);

      setPersonasAdelante(count || 0);
    }

    setLoading(false);
  };

  useEffect(() => {
    cargarDatosTurno();

    // Escuchar cambios en tiempo real en la tabla turnos
    const channel = supabase
      .channel('cliente_turno_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        () => {
          cargarDatosTurno();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [turnoId, ticketParam]);

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-400 text-sm animate-pulse">Cargando estado de tu turno...</p>
      </div>
    );
  }

  if (errorMsg || (!turnoId && !ticketParam)) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {errorMsg || 'No se especificó ningún turno en la URL.'}
        </div>
        <p className="text-xs text-slate-500">
          Ejemplo de uso: <br />
          <code className="text-amber-400">/cliente?ticket=A-01</code> o <code className="text-amber-400">/cliente?id=...</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estado dinámico */}
      {turno?.estado === 'espera' && (
        <>
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-center">
            <span className="text-xs uppercase tracking-wider text-amber-400 font-bold">Estado del Turno</span>
            <p className="text-2xl font-black text-amber-400 mt-1">En Espera</p>
          </div>

          <div className="p-6 bg-slate-800/60 border border-slate-700/50 rounded-xl text-center">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Tu Ticket</span>
            <p className="text-5xl font-extrabold text-white mt-1 mb-2">{turno.codigo_ticket}</p>
            {turno.nombre_cliente && <p className="text-sm text-slate-300 font-medium">{turno.nombre_cliente}</p>}
          </div>

          <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
            <p className="text-xs text-slate-400">Personas delante de ti</p>
            <p className="text-3xl font-extrabold text-slate-200 mt-1">
              {personasAdelante === 0 ? '¡Eres el siguiente!' : personasAdelante}
            </p>
          </div>
        </>
      )}

      {turno?.estado === 'atendiendo' && (
        <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-3 animate-bounce">
          <span className="text-xs uppercase tracking-widest text-emerald-300 font-extrabold">¡ES TU TURNO!</span>
          <p className="text-5xl font-black text-white">{turno.codigo_ticket}</p>
          <p className="text-base text-emerald-200 font-semibold">Pásate a la silla del barbero ✂️</p>
        </div>
      )}

      {turno?.estado === 'finalizado' && (
        <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-2xl text-center space-y-2">
          <span className="text-2xl">🎉</span>
          <h2 className="text-xl font-bold text-slate-200">¡Servicio Finalizado!</h2>
          <p className="text-xs text-slate-400">Gracias por visitarnos en Pégate Ahí.</p>
        </div>
      )}
    </div>
  );
}

export default function ClienteView() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <header className="text-center mb-6">
          <h1 className="text-2xl font-bold text-amber-500">Pégate Ahí</h1>
          <p className="text-slate-400 text-xs">Barbería & Queue System</p>
        </header>

        <Suspense fallback={<p className="text-center text-slate-500 text-xs">Cargando...</p>}>
          <ClienteContent />
        </Suspense>
      </div>
    </main>
  );
}
