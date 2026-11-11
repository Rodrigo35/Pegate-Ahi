'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { APP_CONFIG } from '../../lib/config';

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  llamado_en?: string;
  cliente_llego?: boolean;
  creado_en: string;
}

interface CitaCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono: string;
  tipo_corte: string;
  monto: number;
  fecha: string;
  hora_inicio: string;
  estado: string;
}

interface ServicioOption {
  id: string;
  nombre: string;
  precio: number;
  icono: string;
}

function ClienteContent({ isDark }: { isDark: boolean }) {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');

  // Modo de registro: 'cola' o 'cita'
  const [modoRegistro, setModoRegistro] = useState<'cola' | 'cita'>('cola');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  const [listaServicios, setListaServicios] = useState<ServicioOption[]>(
    APP_CONFIG.servicios
  );
  const [servicioSeleccionado, setServicioSeleccionado] = useState<ServicioOption>(
    APP_CONFIG.servicios[0]
  );

  // Estados para Cola Presencial
  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Estados para Agendamiento de Citas
  const [fechaCita, setFechaCita] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bloquesDisponibles, setBloquesDisponibles] = useState<any[]>([]);
  const [horaCitaSeleccionada, setHoraCitaSeleccionada] = useState<string>('');
  const [citaConfirmada, setCitaConfirmada] = useState<CitaCliente | null>(null);

  // GPS y Reloj
  const [horaActual, setHoraActual] = useState<string>('');
  const [tiempoRestanteSegundos, setTiempoRestanteSegundos] = useState<number | null>(null);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);

  const sonarAlarma = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch (e) {
      console.log('Audio no interactuado aún');
    }
  };

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  // CARGAR TARIFAS DESDE SUPABASE
  useEffect(() => {
    const fetchTarifas = async () => {
      const { data } = await supabase
        .from('servicios_config')
        .select('*')
        .order('id', { ascending: true });

      if (data && data.length > 0) {
        const unicosMap = new Map();
        data.forEach((s) => {
          let icono = '✂️';
          if (s.id === 'barba' || (s.nombre.toLowerCase().includes('barba') && !s.nombre.includes('+'))) {
            icono = '💈';
          } else if (s.id === 'corte_barba' || s.nombre.includes('+')) {
            icono = '✂️💈';
          }

          unicosMap.set(s.nombre.toLowerCase().trim(), {
            id: s.id,
            nombre: s.nombre,
            precio: Number(s.precio),
            icono: icono
          });
        });

        const formateados: ServicioOption[] = Array.from(unicosMap.values());

        setListaServicios(formateados);
        setServicioSeleccionado((prev) => {
          const coincidencia = formateados.find((f) => f.nombre === prev.nombre);
          return coincidencia || formateados[0];
        });
      }
    };

    fetchTarifas();

    const channel = supabase
      .channel('cliente_tarifas_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicios_config' }, () => {
        fetchTarifas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // CARGAR BLOQUES DE HORARIOS PARA CITAS
  useEffect(() => {
    if (modoRegistro !== 'cita') return;

    const cargarHorarios = async () => {
      const fechaObj = new Date(fechaCita + 'T00:00:00');
      const diaSemana = fechaObj.getDay();

      const { data: bloques } = await supabase
        .from('horarios_disponibles')
        .select('*')
        .eq('dia_semana', diaSemana)
        .eq('activo', true)
        .order('hora_inicio', { ascending: true });

      const { data: citasOcupadas } = await supabase
        .from('citas')
        .select('hora_inicio')
        .eq('fecha', fechaCita)
        .neq('estado', 'cancelada');

      const horasOcupadas = new Set(citasOcupadas?.map((c) => c.hora_inicio));

      if (bloques) {
        const libres = bloques.filter((b) => !horasOcupadas.has(b.hora_inicio));
        setBloquesDisponibles(libres);
      }
    };

    cargarHorarios();
  }, [fechaCita, modoRegistro]);

  const obtenerUbicacionGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latBarberia = APP_CONFIG.ubicacionLocal.latitud;
          const lngBarberia = APP_CONFIG.ubicacionLocal.longitud;
          const latCliente = pos.coords.latitude;
          const lngCliente = pos.coords.longitude;

          const R = 6371;
          const dLat = ((latCliente - latBarberia) * Math.PI) / 180;
          const dLng = ((lngCliente - lngBarberia) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((latBarberia * Math.PI) / 180) *
              Math.cos((latCliente * Math.PI) / 180) *
              Math.sin(dLng / 2) *
              Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const dist = R * c;
          setDistanciaKm(parseFloat(dist.toFixed(1)));
        },
        () => console.log('Ubicación no obtenida')
      );
    }
  };

  const cargarTurnoYPosicion = async (codigoOId: string) => {
    let query = supabase.from('turnos').select('*');
    if (codigoOId.includes('-')) {
      query = query.eq('codigo_ticket', codigoOId.toUpperCase());
    } else {
      query = query.eq('id', codigoOId);
    }

    const { data: miTurno, error } = await query.single();

    if (!error && miTurno) {
      if (turno && turno.estado === 'espera' && miTurno.estado === 'atendiendo') {
        sonarAlarma();
      }

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
    if (idBusqueda) cargarTurnoYPosicion(idBusqueda);
    else setLoading(false);

    const channel = supabase
      .channel('cliente_realtime_cola')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        const actualId = ticketParam || turno?.id || turno?.codigo_ticket;
        if (actualId) cargarTurnoYPosicion(actualId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketParam, turno?.id, turno?.codigo_ticket]);

  // Temporizador regresivo de tiempo límite
  useEffect(() => {
    if (turno && turno.estado === 'atendiendo' && turno.modalidad_espera === 'diligencia' && turno.llamado_en && !turno.cliente_llego) {
      const interval = setInterval(() => {
        const horaLlamado = new Date(turno.llamado_en!).getTime();
        const ahora = new Date().getTime();
        const segundosTranscurridos = Math.floor((ahora - horaLlamado) / 1000);
        const limiteSegundos = APP_CONFIG.tiempoLimiteDiligenciaMin * 60;
        const restante = limiteSegundos - segundosTranscurridos;

        setTiempoRestanteSegundos(restante > 0 ? restante : 0);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTiempoRestanteSegundos(null);
    }
  }, [turno]);

  // UNIRME A LA COLA HOY (Teléfono Obligatorio)
  const unirmeALaCola = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !telefono.trim()) return;

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

  // AGENDAR CITA CON FECHA Y HORA (Teléfono Obligatorio)
  const agendarCita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !telefono.trim() || !horaCitaSeleccionada) return;

    setRegistrando(true);
    const numero = Math.floor(Math.random() * 900) + 100;
    const codigo = `C-${numero}`;

    const { data, error } = await supabase
      .from('citas')
      .insert([
        {
          codigo_ticket: codigo,
          nombre_cliente: nombre,
          cliente_telefono: telefono,
          tipo_corte: servicioSeleccionado.nombre,
          monto: servicioSeleccionado.precio,
          fecha: fechaCita,
          hora_inicio: horaCitaSeleccionada,
          estado: 'confirmada',
        },
      ])
      .select()
      .single();

    if (!error && data) {
      setCitaConfirmada(data as CitaCliente);
    }
    setRegistrando(false);
  };

  const cambiarModalidadEnVivo = async (nuevaModalidad: 'local' | 'diligencia') => {
    if (!turno) return;
    setTurno({ ...turno, modalidad_espera: nuevaModalidad });

    if (nuevaModalidad === 'diligencia') {
      obtenerUbicacionGPS();
    }

    await supabase
      .from('turnos')
      .update({ modalidad_espera: nuevaModalidad, cliente_llego: nuevaModalidad === 'local' })
      .eq('id', turno.id);
  };

  const notificarLlegadaPresencial = async () => {
    if (!turno) return;
    setTurno({ ...turno, cliente_llego: true, modalidad_espera: 'local' });
    await supabase.from('turnos').update({ cliente_llego: true, modalidad_espera: 'local' }).eq('id', turno.id);
  };

  const volverAlInicio = () => {
    setTurno(null);
    setCitaConfirmada(null);
    setNombre('');
    setTelefono('');
    window.location.href = '/cliente';
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
    return <div className="text-center py-10 text-slate-400 text-xs animate-pulse">Cargando datos...</div>;
  }

  // --- VISTA CITA CONFIRMADA ---
  if (citaConfirmada) {
    return (
      <div className="space-y-6">
        <div className={`p-6 rounded-2xl text-center shadow-lg border space-y-4 ${
          isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <span className="text-4xl">📅</span>
          <h2 className="text-xl font-black text-emerald-500 uppercase">¡CITA RESERVADA CON ÉXITO!</h2>
          
          <div className="space-y-1">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Código de Confirmación
            </span>
            <p className="text-5xl font-black text-amber-500">{citaConfirmada.codigo_ticket}</p>
          </div>

          <p className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{citaConfirmada.nombre_cliente}</p>
          
          <div className="p-4 rounded-xl border bg-slate-950/40 border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Fecha:</span>
              <span className="font-bold text-amber-400">{citaConfirmada.fecha}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Hora:</span>
              <span className="font-bold text-amber-400">{citaConfirmada.hora_inicio.substring(0, 5)} hrs</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>WhatsApp:</span>
              <span className="font-bold text-emerald-400">{citaConfirmada.cliente_telefono}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Servicio:</span>
              <span className="font-bold text-emerald-400">{citaConfirmada.tipo_corte} ({APP_CONFIG.monedaSimbolo}{citaConfirmada.monto})</span>
            </div>
          </div>

          <button
            onClick={volverAlInicio}
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded-xl transition-all shadow-lg active:scale-95"
          >
            Aceptar / Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  // --- MODO MONITOR DE TURNO EN COLA ---
  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * APP_CONFIG.tiempoEstimadoPorClienteMin;

    const porcentajeProgreso =
      turno.estado === 'atendiendo' || turno.estado === 'finalizado'
        ? 100
        : Math.min(100, Math.max(10, Math.round(((totalInicialCola - personasAdelante) / totalInicialCola) * 100)));

    return (
      <div className="space-y-6">
        <div className={`flex justify-between items-center text-xs px-4 py-2 rounded-xl border ${
          isDark ? 'text-slate-400 bg-slate-800/40 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'
        }`}>
          <span>Hora Actual:</span>
          <span className="font-mono font-bold text-amber-500 text-sm">{horaActual}</span>
        </div>

        <div className={`p-6 rounded-2xl text-center shadow-lg border ${
          isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Tu Número de Turno
          </span>
          <p className="text-5xl font-black text-amber-500 mt-1">{turno.codigo_ticket}</p>
          <p className={`text-sm font-semibold mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{turno.nombre_cliente}</p>
          
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs rounded-full font-medium">
              {turno.tipo_corte} ({APP_CONFIG.monedaSimbolo}{turno.monto})
            </span>
            <span className={`px-3 py-1 border text-xs rounded-full font-medium ${
              turno.modalidad_espera === 'diligencia'
                ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
            }`}>
              {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera (Diligencia)' : '💈 En Barbería'}
            </span>
          </div>
        </div>

        {/* EN ESPERA */}
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

            <div className={`p-4 rounded-xl border space-y-3 text-center ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <p className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                ¿Necesitas salir del local a hacer una diligencia?
              </p>

              {turno.modalidad_espera === 'local' ? (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
                >
                  🏃‍♂️ Avisar que salgo a hacer diligencias ({APP_CONFIG.tiempoLimiteDiligenciaMin} min)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
                >
                  💈 Avisar que ya regresé al local
                </button>
              )}
            </div>

            {distanciaKm !== null && turno.modalidad_espera === 'diligencia' && (
              <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl text-center text-xs text-amber-400 font-semibold">
                📍 Distancia actual a la barbería: ~{distanciaKm} km
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-xl text-center border ${isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personas Delante</span>
                <p className={`text-3xl font-black mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{personasAdelante}</p>
              </div>

              <div className={`p-4 rounded-xl text-center border ${isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tiempo Estimado</span>
                <p className="text-3xl font-black text-amber-500 mt-1">~ {tiempoEstimado} min</p>
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

        {/* ATENDIENDO / LLAMADO */}
        {turno.estado === 'atendiendo' && (
          <div className="space-y-4">
            {turno.cliente_llego ? (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-2">
                <span className="text-3xl">💈</span>
                <h2 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>¡TE HAS REPORTADO EN EL LOCAL!</h2>
                <p className="text-xs text-emerald-400 font-medium">El barbero ya sabe que estás esperando en la silla.</p>
              </div>
            ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <div className={`border-2 border-amber-500 p-6 rounded-2xl text-center space-y-4 shadow-2xl ${isDark ? 'bg-slate-900' : 'bg-amber-50'}`}>
                <span className="text-4xl">🏃‍♂️</span>
                <h2 className="text-xl font-black text-amber-500 uppercase">¡EL BARBERO TE HA LLAMADO!</h2>
                
                <div className={`p-5 rounded-xl text-center border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Tiempo Restante para Llegar</span>
                  <p className="text-5xl font-black font-mono text-amber-500 mt-1">{formatearTiempo(tiempoRestanteSegundos)}</p>
                </div>

                <button
                  onClick={notificarLlegadaPresencial}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg animate-bounce"
                >
                  📍 ¡Ya llegué a la Barbería!
                </button>
              </div>
            ) : (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-3">
                <span className="text-3xl">✂️</span>
                <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>¡ES TU TURNO!</h2>
              </div>
            )}
          </div>
        )}

        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className={`border p-6 rounded-2xl text-center space-y-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
            <h2 className={`text-lg font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {turno.estado === 'finalizado' ? '¡Servicio Completado!' : '¡Tiempo Agotado!'}
            </h2>
            <button onClick={volverAlInicio} className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded-xl transition-all active:scale-95">
              🔄 Tomar Nuevo Turno
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- FORMULARIO REGISTRO INICIAL ---
  return (
    <div className="space-y-5">
      <div className={`flex justify-between items-center text-xs px-4 py-2 rounded-xl border mb-2 ${
        isDark ? 'text-slate-400 bg-slate-800/40 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'
      }`}>
        <span>Hora Actual:</span>
        <span className="font-mono font-bold text-amber-500 text-sm">{horaActual}</span>
      </div>

      {/* Pestañas para elegir Modo */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/50 border border-slate-700/60 rounded-xl text-xs font-bold">
        <button
          type="button"
          onClick={() => setModoRegistro('cola')}
          className={`py-2.5 rounded-lg transition-all ${
            modoRegistro === 'cola' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          💈 Cola Presencial (Hoy)
        </button>
        <button
          type="button"
          onClick={() => setModoRegistro('cita')}
          className={`py-2.5 rounded-lg transition-all ${
            modoRegistro === 'cita' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          📅 Reservar Cita Previa
        </button>
      </div>

      <form onSubmit={modoRegistro === 'cola' ? unirmeALaCola : agendarCita} className="space-y-5">
        <div>
          <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            Tu Nombre <span className="text-rose-500">*</span>
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
            Teléfono / WhatsApp <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            required
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
            {listaServicios.map((srv) => {
              const selected = servicioSeleccionado.nombre === srv.nombre;
              return (
                <div
                  key={srv.id}
                  onClick={() => setServicioSeleccionado(srv)}
                  className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                    selected
                      ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold'
                      : isDark ? 'bg-slate-800/40 border-slate-800 text-slate-300 hover:border-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{srv.icono}</span>
                    <span className="font-bold text-sm">{srv.nombre}</span>
                  </div>
                  <span className="font-extrabold text-sm">{APP_CONFIG.monedaSimbolo}{srv.precio}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* MODO COLA PRESENCIAL */}
        {modoRegistro === 'cola' && (
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
                    ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold'
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
                onClick={() => {
                  setModalidadEspera('diligencia');
                  obtenerUbicacionGPS();
                }}
                className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  modalidadEspera === 'diligencia'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500 font-bold'
                    : isDark ? 'bg-slate-800/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <span className="text-lg">🏃‍♂️</span>
                <div className="mt-2">
                  <p className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>Hacer Diligencias</p>
                  <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{APP_CONFIG.tiempoLimiteDiligenciaMin} min (GPS)</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* MODO RESERVA DE CITA */}
        {modoRegistro === 'cita' && (
          <div className="space-y-4">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Selecciona la Fecha
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={fechaCita}
                onChange={(e) => setFechaCita(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm font-bold focus:outline-none focus:border-amber-500 ${
                  isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Horarios Disponibles
              </label>
              {bloquesDisponibles.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4 border border-dashed rounded-xl">
                  No hay bloques disponibles para esta fecha.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {bloquesDisponibles.map((b) => {
                    const horaText = b.hora_inicio.substring(0, 5);
                    const selected = horaCitaSeleccionada === b.hora_inicio;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setHoraCitaSeleccionada(b.hora_inicio)}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                          selected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg'
                            : isDark ? 'bg-slate-800 text-slate-200 border-slate-700 hover:border-amber-500/50' : 'bg-slate-100 text-slate-800 border-slate-200'
                        }`}
                      >
                        📅 {horaText}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={registrando || !nombre.trim() || !telefono.trim() || (modoRegistro === 'cita' && !horaCitaSeleccionada)}
          className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {registrando
            ? 'Procesando...'
            : modoRegistro === 'cola'
            ? 'UNIRME A LA COLA'
            : 'CONFIRMAR CITA PREVIA'}
        </button>
      </form>
    </div>
  );
}

export default function ClienteView() {
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const [esNoche, setEsNoche] = useState<boolean>(false);

  useEffect(() => {
    const hora = new Date().getHours();
    setEsNoche(hora >= 19 || hora < 6);
  }, []);

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'
    }`}>
      <div className={`max-w-md w-full border rounded-3xl p-6 md:p-8 shadow-2xl ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/20">
          <div>
            <h1 className="text-2xl font-black text-amber-500 tracking-wide">{APP_CONFIG.nombreNegocio}</h1>
            <p className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {APP_CONFIG.subtitulo}
            </p>
          </div>

          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-semibold ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-300'
          }`}>
            <button
              onClick={() => setModoTema('light')}
              className={`p-1.5 rounded-lg transition-all ${modoTema === 'light' ? 'bg-amber-500 text-slate-950 font-bold' : isDark ? 'text-slate-400' : 'text-slate-600'}`}
            >
              ☀️
            </button>
            <button
              onClick={() => setModoTema('dark')}
              className={`p-1.5 rounded-lg transition-all ${modoTema === 'dark' ? 'bg-amber-500 text-slate-950 font-bold' : isDark ? 'text-slate-400' : 'text-slate-600'}`}
            >
              🌙
            </button>
            <button
              onClick={() => setModoTema('auto')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${modoTema === 'auto' ? 'bg-amber-500 text-slate-950' : isDark ? 'text-slate-400' : 'text-slate-600'}`}
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
