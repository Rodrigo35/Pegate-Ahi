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
  modalidad_espera?: 'local' | 'diligencia';
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
  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);

  // Estados del turno activo
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Reloj digital en vivo
  const [horaActual, setHoraActual] = useState<string>('');

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  const cargarTurnoYPosicion = async (codigoOId: string) => {
    let query = supabase.from('turnos').select('*');
    if (codigoOId.includes('-')) {
      query = query.eq('codigo_ticket', codigoOId.toUpperCase());
    } else {
      query = query.eq('id', codigoOId);
    }

    const { data: miTurno, error } = await query.single();

    if (!error && miTurno) {
      setTurno(miTurno as TurnoCliente);

      if (miTurno.estado === 'espera') {
        const { count } = await supabase
          .from('turnos')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'espera')
          .lt('creado_en', miTurno.creado_en);

        const delante = count || 0;
        setPersonasAdelante(delante);

        if (delante >= totalInicialCola) {
          setTotalInicialCola(delante + 1);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const idBusqueda = ticketParam || turno?.id || turno?.codigo_ticket;

    if (idBusqueda) {
      cargarTurnoYPosicion(idBusqueda);
    } else {
      setLoading(false);
    }

    const channel = supabase
      .channel('cliente_realtime_cola')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        () => {
          const actualId = ticketParam || turno?.id || turno?.codigo_ticket;
          if (actualId) {
            cargarTurnoYPosicion(actualId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketParam, turno?.id, turno?.codigo_ticket]);

  const unirmeALaCola = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    setRegistrando(true);

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
          modalidad_espera: modalidadEspera,
          estado: 'espera',
        },
      ])
      .select()
      .single();

    if (!error && data) {
      setTurno(data as TurnoCliente);
      window.history.pushState({}, '', `/cliente?ticket=${data.codigo_ticket}`);
      cargarTurnoYPosicion(data.codigo_ticket);
    }
    setRegistrando(false);
  };

  const cambiarModalidadEnVivo = async (nuevaModalidad: 'local' | 'diligencia') => {
    if (!turno) return;
    setTurno({ ...turno, modalidad_espera: nuevaModalidad });
    await supabase.from('turnos').update({ modalidad_espera: nuevaModalidad }).eq('id', turno.id);
  };

  const volverAlInicio = () => {
    setTurno(null);
    setNombre('');
    window.history.pushState({}, '', '/cliente');
  };

  const cancelarTurno = async () => {
    if (!turno) return;
    const confirmar = confirm('¿Seguro que deseas cancelar tu turno en la cola?');
    if (!confirmar) return;

    await supabase.from('turnos').update({ estado: 'cancelado' }).eq('id', turno.id);
    volverAlInicio();
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-400 text-xs animate-pulse">Cargando datos de la cola...</p>
      </div>
    );
  }

  // --- MONITOR CON MODALIDAD Y PROGRESO ---
  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * 20;

    const porcentajeProgreso =
      turno.estado === 'atendiendo' || turno.estado === 'finalizado'
        ? 100
        : Math.min(100, Math.max(10, Math.round(((totalInicialCola - personasAdelante) / totalInicialCola) * 100)));

    return (
      <div className="space-y-6">
        {/* Reloj Digital */}
        <div className="flex justify-between items-center text-xs text-slate-400 bg-slate-800/40 px-4 py-2 rounded-xl border border-slate-800">
          <span>Hora Actual:</span>
          <span className="font-mono font-bold text-amber-400 text-sm">{horaActual}</span>
        </div>

        {/* Encabezado del ticket */}
        <div className="bg-slate-800/80 border border-slate-700/60 p-6 rounded-2xl text-center shadow-lg relative overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tu Número de Turno</span>
          <p className="text-5xl font-black text-amber-400 mt-1">{turno.codigo_ticket}</p>
          <p className="text-sm font-semibold text-white mt-1">{turno.nombre_cliente}</p>
          
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs rounded-full font-medium">
              {turno.tipo_corte} (${turno.monto})
            </span>
            <span className="px-3 py-1 bg-slate-700/60 text-slate-300 border border-slate-600/50 text-xs rounded-full font-medium">
              {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera (Diligencia)' : '💈 En Barbería'}
            </span>
          </div>
        </div>

        {/* CONTADOR & BARRA DE TIEMPO */}
        {turno.estado === 'espera' && (
          <div className="space-y-4">
            <div className="bg-slate-800/60 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400">Progreso en Cola</span>
                <span className="text-amber-400 font-mono">{porcentajeProgreso}%</span>
              </div>
              <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-700 ease-out shadow-sm"
                  style={{ width: `${porcentajeProgreso}%` }}
                ></div>
              </div>
            </div>

            {/* Aviso especial si está en diligencias */}
            {turno.modalidad_espera === 'diligencia' && (
              <div className="p-3 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-center text-xs font-semibold text-indigo-300">
                🚶‍♂️ Tienes tiempo para tus trámites. Te sugerimos regresar cuando queden <strong>2 personas</strong> por delante.
              </div>
            )}

            {personasAdelante === 0 ? (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-center text-xs font-bold text-emerald-300 animate-pulse">
                ⚡ ¡Eres el próximo en entrar a la silla! Regresa a la barbería.
              </div>
            ) : personasAdelante === 1 ? (
              <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-center text-xs font-bold text-amber-300 animate-pulse">
                🔔 ¡Atención! Solo hay 1 persona delante de ti. Por favor, ve acercándote al local.
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Personas Delante</span>
                <p className="text-3xl font-black text-slate-100 mt-1">{personasAdelante === 0 ? '0' : personasAdelante}</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Tiempo Estimado</span>
                <p className="text-3xl font-black text-amber-400 mt-1">
                  {personasAdelante === 0 ? '~ 5 min' : `~ ${tiempoEstimado} min`}
                </p>
              </div>
            </div>

            {/* Selector dinámico para cambiar de modalidad en vivo */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-400">¿Dónde esperarás?</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    turno.modalidad_espera === 'local'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  💈 Local
                </button>
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    turno.modalidad_espera === 'diligencia'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  🏃 Fuera
                </button>
              </div>
            </div>

            <button
              onClick={cancelarTurno}
              className="w-full py-3 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all"
            >
              ❌ Cancelar mi turno
            </button>
          </div>
        )}

        {turno.estado === 'atendiendo' && (
          <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-3 animate-bounce">
            <span className="text-3xl">✂️</span>
            <h2 className="text-2xl font-black text-white">¡ES TU TURNO!</h2>
            <p className="text-xs text-emerald-200 font-medium">Por favor dirígete a la silla del barbero.</p>
          </div>
        )}

        {turno.estado === 'finalizado' && (
          <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-2xl text-center space-y-4">
            <span className="text-3xl">🎉</span>
            <div>
              <h2 className="text-lg font-bold text-slate-200">¡Servicio Completado!</h2>
              <p className="text-xs text-slate-400">Gracias por tu preferencia en Pégate Ahí.</p>
            </div>

            <button
              onClick={volverAlInicio}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95"
            >
              🔄 Tomar un Nuevo Turno
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- FORMULARIO DE REGISTRO CON MODALIDAD DE ESPERA ---
  return (
    <form onSubmit={unirmeALaCola} className="space-y-6">
      <div className="flex justify-between items-center text-xs text-slate-400 bg-slate-800/40 px-4 py-2 rounded-xl border border-slate-800 mb-2">
        <span>Hora Actual:</span>
        <span className="font-mono font-bold text-amber-400 text-sm">{horaActual}</span>
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-xl font-extrabold text-white">¡Bienvenido!</h2>
        <p className="text-xs text-slate-400">Tu próximo corte, sin largas esperas.</p>
      </div>

      {/* Nombre */}
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

      {/* Servicios */}
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

      {/* OPCIÓN: ¿Dónde esperarás? */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">¿Dónde esperarás tu turno?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModalidadEspera('local')}
            className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
              modalidadEspera === 'local'
                ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="text-lg">💈</span>
            <div className="mt-2">
              <p className="font-bold text-xs text-white">En el Local</p>
              <p className="text-[10px] text-slate-400">Espero dentro de la barbería</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setModalidadEspera('diligencia')}
            className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
              modalidadEspera === 'diligencia'
                ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400'
                : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="text-lg">🏃‍♂️</span>
            <div className="mt-2">
              <p className="font-bold text-xs text-white">Hacer Diligencias</p>
              <p className="text-[10px] text-slate-400">Salgo y vuelvo a mi hora</p>
            </div>
          </button>
        </div>
      </div>

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
