'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  tipo_corte: string;
  monto: number;
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado';
  barbero_nombre?: string;
  creado_en: string;
}

const SERVICIOS = [
  { id: 'corte_clasico', nombre: 'Corte clásico', precio: 10, icono: '✂️' },
  { id: 'corte_barba', nombre: 'Corte + barba', precio: 15, icono: '💈' },
  { id: 'barba', nombre: 'Barba', precio: 7, icono: '🧔' },
];

function ClienteContent() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');

  // Estados del cliente
  const [nombre, setNombre] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(SERVICIOS[0]);
  const [registrando, setRegistrando] = useState(false);

  // Estados del turno activo
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Cargar datos del turno activo si existe
  const cargarTurno = async (codigoOId: string) => {
    let query = supabase.from('turnos').select('*');
    if (codigoOId.includes('-')) {
      query = query.eq('codigo_ticket', codigoOId.toUpperCase());
    } else {
      query = query.eq('id', codigoOId);
    }

    const { data, error } = await query.single();

    if (!error && data) {
      setTurno(data as TurnoCliente);

      if (data.estado === 'espera') {
        const { count } = await supabase
          .from('turnos')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'espera')
          .lt('creado_en', data.creado_en);

        setPersonasAdelante(count || 0);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (ticketParam) {
      cargarTurno(ticketParam);
    } else {
      setLoading(false);
    }

    // Suscripción a cambios en tiempo real
    const channel = supabase
      .channel('cliente_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        if (ticketParam || turno?.id) {
          cargarTurno(ticketParam || turno!.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketParam, turno?.id]);

  // Acción: Registrar nuevo turno
  const unirmeALaCola = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    setRegistrando(true);

    // Generar correlativo aleatorio (Ej: B-012)
    const numero = Math.floor(Math.random() * 900) + 100;
    const codigo = `B-${numero}`;

    const { data, error } = await supabase
      .from('turnos')
      .insert([
        {
          codigo_ticket: codigo,
          nombre_cliente: nombre,
          tipo_corte: servicioSeleccionado.nombre,
          monto: servicioSeleccionado.precio,
          estado: 'espera',
        },
      ])
      .select()
      .single();

    if (!error && data) {
      setTurno(data as TurnoCliente);
      // Actualizar URL sin recargar
      window.history.pushState({}, '', `/cliente?ticket=${data.codigo_ticket}`);
      cargarTurno(data.codigo_ticket);
    }
    setRegistrando(false);
  };

  // Acción: Cancelar turno
  const cancelarTurno = async () => {
    if (!turno) return;
    const confirmar = confirm('¿Seguro que deseas cancelar tu turno en la cola?');
    if (!confirmar) return;

    await supabase
      .from('turnos')
      .update({ estado: 'cancelado' })
      .eq('id', turno.id);

    setTurno(null);
    window.history.pushState({}, '', '/cliente');
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-400 text-xs animate-pulse">Cargando la cola de barbería...</p>
      </div>
    );
  }

  // --- MODO 1: SEGUIMIENTO DEL TURNO (SI YA ESTÁ REGISTRADO) ---
  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * 20; // 20 min promedio por cliente

    return (
      <div className="space-y-6">
        {/* Encabezado del ticket */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-6 rounded-2xl text-center shadow-lg relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tu Número de Turno</span>
          <p className="text-5xl font-black text-amber-400 mt-1">{turno.codigo_ticket}</p>
          <p className="text-sm font-semibold text-white mt-1">{turno.nombre_cliente}</p>
          <span className="inline-block mt-2 px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs rounded-full font-medium">
            {turno.tipo_corte} (${turno.monto})
          </span>
        </div>

        {/* Notificación según el estado */}
        {turno.estado === 'espera' && (
          <div className="space-y-3">
            {personasAdelante === 1 && (
              <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-center text-xs font-bold text-amber-300 animate-pulse">
                🔔 ¡Atención! Eres el siguiente en la lista.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Personas Delante</span>
                <p className="text-2xl font-black text-slate-200 mt-1">
                  {personasAdelante === 0 ? '¡Ninguna!' : personasAdelante}
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Tiempo Estimado</span>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  {personasAdelante === 0 ? '~ 5 min' : `~ ${tiempoEstimado} min`}
                </p>
              </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Barbero asignado:</span>
              <span className="font-bold text-slate-200">{turno.barbero_nombre || 'Por asignar'}</span>
            </div>
          </div>
        )}

        {turno.estado === 'atendiendo' && (
          <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-2 animate-bounce">
            <span className="text-2xl">✂️</span>
            <h2 className="text-2xl font-black text-white">¡ES TU TURNO!</h2>
            <p className="text-xs text-emerald-200 font-medium">Por favor dirígete a la silla del barbero.</p>
          </div>
        )}

        {turno.estado === 'finalizado' && (
          <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-2xl text-center space-y-2">
            <span className="text-3xl">🎉</span>
            <h2 className="text-lg font-bold text-slate-200">¡Servicio Completado!</h2>
            <p className="text-xs text-slate-400">Gracias por tu preferencia en Pégate Ahí.</p>
          </div>
        )}

        {/* Botón para cancelar */}
        {turno.estado === 'espera' && (
          <button
            onClick={cancelarTurno}
            className="w-full py-3 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all"
          >
            ❌ Cancelar mi turno
          </button>
        )}
      </div>
    );
  }

  // --- MODO 2: FORMULARIO PARA REGISTRARSE ---
  return (
    <form onSubmit={unirmeALaCola} className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-white">¡Bienvenido!</h2>
        <p className="text-xs text-slate-400">Tu próximo corte, sin largas esperas.</p>
      </div>

      {/* Input Nombre */}
      <div>
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Tu Nombre</label>
        <input
          type="text"
          required
          placeholder="Ej: Carlos Pérez"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500 transition-all"
        />
      </div>

      {/* Selección de Servicio */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">Selecciona tu servicio</label>
        <div className="grid grid-cols-1 gap-2.5">
          {SERVICIOS.map((srv) => {
            const selected = servicioSeleccionado.id === srv.id;
            return (
              <div
                key={srv.id}
                onClick={() => setServicioSeleccionado(srv)}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                  selected
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                    : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{srv.icono}</span>
                  <span className="font-bold text-sm">{srv.nombre}</span>
                </div>
                <span className="font-extrabold text-sm">${srv.precio}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Botón Principal */}
      <button
        type="submit"
        disabled={registrando}
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-500/10 active:scale-95 disabled:opacity-50"
      >
        {registrando ? 'Registrando...' : 'UNIRME A LA COLA'}
      </button>
    </form>
  );
}

export default function ClienteView() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">
        <header className="text-center mb-6">
          <h1 className="text-2xl font-black text-amber-500 tracking-wide">PÉGATE AHÍ</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Barbería & Queue System</p>
        </header>

        <Suspense fallback={<p className="text-center text-slate-500 text-xs">Cargando...</p>}>
          <ClienteContent />
        </Suspense>
      </div>
    </main>
  );
}
