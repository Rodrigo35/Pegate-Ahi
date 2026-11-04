'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono?: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  llamado_en?: string;
  barbero_nombre?: string;
  creado_en: string;
}

const SERVICIOS = [
  { id: 'corte_clasico', nombre: 'Corte clásico', precio: 10, icono: '✂️' },
  { id: 'corte_barba', nombre: 'Corte + barba', precio: 15, icono: '💈' },
  { id: 'barba', nombre: 'Barba', precio: 7, icono: '🧔' },
];

function ClienteContent({ isDark }: { isDark: boolean }) {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(SERVICIOS[0]);
  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);

  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Reloj digital y temporizador de 30 minutos
  const [horaActual, setHoraActual] = useState<string>('');
  const [tiempoRestanteSegundos, setTiempoRestanteSegundos] = useState<number | null>(null);

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

  // TEMPORIZADOR REGRESIVO (30 MINUTOS = 1800 SEGUNDOS)
  useEffect(() => {
    if (turno && turno.estado === 'atendiendo' && turno.modalidad_espera === 'diligencia' && turno.llamado_en) {
      const interval = setInterval(() => {
        const horaLlamado = new Date(turno.llamado_en!).getTime();
        const ahora = new Date().getTime();
        const segundosTranscurridos = Math.floor((ahora - horaLlamado) / 1000);
        const restante = 1800 - segundosTranscurridos;

        setTiempoRestanteSegundos(restante > 0 ? restante : 0);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTiempoRestanteSegundos(null);
    }
  }, [turno]);

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
          cliente_telefono: telefono,
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
    setTelefono('');
    window.history.pushState({}, '', '/cliente');
  };

  const cancelarTurno = async () => {
    if (!turno) return;
    const confirmar = confirm('¿Seguro que deseas cancelar tu turno en la cola?');
    if (!confirmar) return;

    await supabase.from('turnos').update({ estado: 'cancelado' }).eq('id', turno.id);
    volverAlInicio();
  };

  const formatearTiempo = (seg: number) => {
    const mins = Math.floor(seg / 60);
    const secs = seg % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className={isDark ? "text-slate-400 text-xs animate-pulse" : "text-slate-500 text-xs animate-pulse"}>Cargando datos de la cola...</p>
      </div>
    );
  }

  // --- MONITOR DE TURNO ---
  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * 20;

    const porcentajeProgreso =
      turno.estado === 'atendiendo' || turno.estado === 'finalizado'
        ? 100
        : Math.min(100, Math.max(10, Math.round(((totalInicialCola - personasAdelante) / totalInicialCola) * 100)));

    return (
      <div className="space-y-6">
        {/* Hora actual en vivo */}
        <div className={`flex justify-between items-center text-xs px-4 py-2 rounded-xl border ${
          isDark ? 'text-slate-400 bg-slate-800/40 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'
        }`}>
          <span>Hora Actual:</span>
          <span className="font-mono font-bold text-amber-500 text-sm">{horaActual}</span>
        </div>

        {/* Encabezado del ticket */}
        <div className={`p-6 rounded-2xl text-center shadow-lg relative overflow-hidden border ${
          isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Tu Número de Turno
          </span>
          <p className="text-5xl font-black text-amber-500 mt-1">{turno.codigo_ticket}</p>
          <p className={`text-sm font-semibold mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{turno.nombre_cliente}</p>
          
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs rounded-full font-medium">
              {turno.tipo_corte} (${turno.monto})
            </span>
            <span className={`px-3 py-1 border text-xs rounded-full font-medium ${
              isDark ? 'bg-slate-700/60 text-slate-300 border-slate-600/50' : 'bg-slate-200 text-slate-700 border-slate-300'
            }`}>
              {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera (Diligencia)' : '💈 En Barbería'}
            </span>
          </div>
        </div>

        {/* MODO 1: EN ESPERA */}
        {turno.estado === 'espera' && (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border space-y-2 ${
              isDark ? 'bg-slate-800/60 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex justify-between items-center text-xs font-bold">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Progreso en Cola</span>
                <span className="text-amber-500 font-mono">{porcentajeProgreso}%</span>
              </div>
              <div className={`w-full h-3 rounded-full overflow-hidden border p-0.5 ${
                isDark ? 'bg-slate-900 border-slate-700/50' : 'bg-slate-200 border-slate-300'
              }`}>
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-700 ease-out shadow-sm"
                  style={{ width: `${porcentajeProgreso}%` }}
                ></div>
              </div>
            </div>

            {turno.modalidad_espera === 'diligencia' && (
              <div className={`p-3 rounded-xl text-center text-xs font-semibold border ${
                isDark ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
              }`}>
                🚶‍♂️ Estás de diligencia. Al llamarte dispondrás de <strong>30 minutos</strong> para llegar al local.
              </div>
            )}

            {personasAdelante === 0 ? (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-center text-xs font-bold text-emerald-600 dark:text-emerald-300 animate-pulse">
                ⚡ ¡Eres el próximo en entrar! Ve dirigiéndote al local.
              </div>
            ) : personasAdelante === 1 ? (
              <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-center text-xs font-bold text-amber-600 dark:text-amber-300 animate-pulse">
                🔔 Queda 1 persona delante. ¡Ve regresando a la barbería!
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-xl text-center border ${
                isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}>
                <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personas Delante</span>
                <p className={`text-3xl font-black mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{personasAdelante}</p>
              </div>

              <div className={`p-4 rounded-xl text-center border ${
                isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}>
                <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tiempo Estimado</span>
                <p className="text-3xl font-black text-amber-500 mt-1">
                  {personasAdelante === 0 ? '~ 5 min' : `~ ${tiempoEstimado} min`}
                </p>
              </div>
            </div>

            <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>¿Dónde esperarás?</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    turno.modalidad_espera === 'local'
                      ? 'bg-amber-500 text-slate-950'
                      : isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  💈 Local
                </button>
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    turno.modalidad_espera === 'diligencia'
                      ? 'bg-indigo-600 text-white'
                      : isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🏃 Fuera
                </button>
              </div>
            </div>

            <button
              onClick={cancelarTurno}
              className="w-full py-3 text-xs font-bold text-rose-500 hover:text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all"
            >
              ❌ Cancelar mi turno
            </button>
          </div>
        )}

        {/* MODO 2: TE HAN LLAMADO (CON TEMPORIZADOR DE 30 MIN) */}
        {turno.estado === 'atendiendo' && (
          <div className="space-y-4">
            {turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <div className={`border-2 border-amber-500 p-6 rounded-2xl text-center space-y-4 shadow-2xl ${
                isDark ? 'bg-slate-900' : 'bg-amber-50'
              }`}>
                <span className="text-4xl">🏃‍♂️</span>
                <div>
                  <h2 className="text-xl font-black text-amber-500 uppercase">¡EL BARBERO TE HA LLAMADO!</h2>
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Dirígete a la barbería antes de que expire el tiempo.</p>
                </div>

                <div className={`p-5 rounded-xl text-center border ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-inner'
                }`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tiempo Restante para Llegar
                  </span>
                  <p className={`text-5xl font-black font-mono mt-1 ${
                    tiempoRestanteSegundos < 300 ? 'text-rose-500 animate-pulse' : 'text-amber-500'
                  }`}>
                    {formatearTiempo(tiempoRestanteSegundos)}
                  </p>
                </div>

                <div className={`w-full h-2.5 rounded-full overflow-hidden border ${
                  isDark ? 'bg-slate-800 border-slate-800' : 'bg-slate-200 border-slate-300'
                }`}>
                  <div
                    className="h-full bg-amber-500 transition-all duration-1000"
                    style={{ width: `${(tiempoRestanteSegundos / 1800) * 100}%` }}
                  ></div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-3 animate-bounce">
                <span className="text-3xl">✂️</span>
                <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>¡ES TU TURNO!</h2>
                <p className={`text-xs font-medium ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>Por favor dirígete a la silla del barbero.</p>
              </div>
            )}
          </div>
        )}

        {/* MODO 3: AUSENTE */}
        {turno.estado === 'ausente' && (
          <div className="bg-rose-500/10 border-2 border-rose-500/40 p-6 rounded-2xl text-center space-y-4">
            <span className="text-4xl">⏱️</span>
            <div>
              <h2 className="text-lg font-bold text-rose-500">¡Tiempo Límite Agotado!</h2>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Transcurrieron los 30 minutos de tolerancia y el barbero avanzó con el siguiente cliente.
              </p>
            </div>

            <button
              onClick={volverAlInicio}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95"
            >
              🔄 Solicitar un Nuevo Turno
            </button>
          </div>
        )}

        {/* MODO 4: FINALIZADO */}
        {turno.estado === 'finalizado' && (
          <div className={`border p-6 rounded-2xl text-center space-y-4 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'
          }`}>
            <span className="text-3xl">🎉</span>
            <div>
              <h2 className={`text-lg font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>¡Servicio Completado!</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Gracias por tu preferencia en Pégate Ahí.</p>
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

  // --- FORMULARIO REGISTRO ---
  return (
    <form onSubmit={unirmeALaCola} className="space-y-6">
      <div className={`flex justify-between items-center text-xs px-4 py-2 rounded-xl border mb-2 ${
        isDark ? 'text-slate-400 bg-slate-800/40 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'
      }`}>
        <span>Hora Actual:</span>
        <span className="font-mono font-bold text-amber-500 text-sm">{horaActual}</span>
      </div>

      <div className="text-center space-y-1">
        <h2 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>¡Bienvenido!</h2>
        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tu próximo corte, sin largas esperas.</p>
      </div>

      <div>
        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          Tu Nombre
        </label>
        <input
          type="text"
          required
          placeholder="Ej: Carlos Pérez"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-amber-500 transition-all ${
            isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
          }`}
        />
      </div>

      <div>
        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          Teléfono / WhatsApp (Opcional)
        </label>
        <input
          type="tel"
          placeholder="Ej: 04141234567"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-amber-500 transition-all ${
            isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
          }`}
        />
      </div>

      <div className="space-y-2">
        <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          Selecciona tu servicio
        </label>
        <div className="grid grid-cols-1 gap-2.5">
          {SERVICIOS.map((srv) => {
            const selected = servicioSeleccionado.id === srv.id;
            return (
              <div
                key={srv.id}
                onClick={() => setServicioSeleccionado(srv)}
                className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                  selected
                    ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                    : isDark ? 'bg-slate-800/40 border-slate-800 text-slate-300 hover:border-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
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

      <div className="space-y-2">
        <label className={`block text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          ¿Dónde esperarás tu turno?
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModalidadEspera('local')}
            className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
              modalidadEspera === 'local'
                ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                : isDark ? 'bg-slate-800/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <span className="text-lg">💈</span>
            <div className="mt-2">
              <p className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>En el Local</p>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Espero en la barbería</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setModalidadEspera('diligencia')}
            className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
              modalidadEspera === 'diligencia'
                ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500'
                : isDark ? 'bg-slate-800/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <span className="text-lg">🏃‍♂️</span>
            <div className="mt-2">
              <p className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>Hacer Diligencias</p>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>30 min para regresar</p>
            </div>
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={registrando}
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
      >
        {registrando ? 'Registrando...' : 'UNIRME A LA COLA'}
      </button>
    </form>
  );
}

export default function ClienteView() {
  // Estado del tema: 'auto' | 'light' | 'dark'
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const [esNoche, setEsNoche] = useState<boolean>(false);

  // Determinar automáticamente el día/noche según la hora
  useEffect(() => {
    const evaluarHora = () => {
      const hora = new Date().getHours();
      // Es de noche de 7:00 PM (19) a 5:59 AM (5)
      setEsNoche(hora >= 19 || hora < 6);
    };

    evaluarHora();
    const interval = setInterval(evaluarHora, 60000); // Evaluar cada minuto
    return () => clearInterval(interval);
  }, []);

  // Determinar si aplica el modo oscuro
  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'
    }`}>
      <div className={`max-w-md w-full border rounded-3xl p-6 md:p-8 shadow-2xl transition-all ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {/* Cabecera con Selector de Tema */}
        <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/20">
          <div>
            <h1 className="text-2xl font-black text-amber-500 tracking-wide">PÉGATE AHÍ</h1>
            <p className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Barbería & Queue System
            </p>
          </div>

          {/* Switch de Tema */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-semibold ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
          }`}>
            <button
              onClick={() => setModoTema('light')}
              title="Modo Claro"
              className={`p-1.5 rounded-lg transition-all ${
                modoTema === 'light' ? 'bg-amber-500 text-slate-950 font-bold' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600'
              }`}
            >
              ☀️
            </button>
            <button
              onClick={() => setModoTema('dark')}
              title="Modo Oscuro"
              className={`p-1.5 rounded-lg transition-all ${
                modoTema === 'dark' ? 'bg-amber-500 text-slate-950 font-bold' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600'
              }`}
            >
              🌙
            </button>
            <button
              onClick={() => setModoTema('auto')}
              title="Automático por Hora"
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                modoTema === 'auto'
                  ? 'bg-amber-500 text-slate-950'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600'
              }`}
            >
              🔄 Auto
            </button>
          </div>
        </header>

        <Suspense fallback={<p className="text-center text-slate-500 text-xs">Cargando...</p>}>
          <ClienteContent isDark={isDark} />
        </Suspense>
      </div>
    </main>
  );
}
