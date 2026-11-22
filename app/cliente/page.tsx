'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
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

const getMananaLocal = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getHoyLocal = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function ClienteContent() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');

  const [modoRegistro, setModoRegistro] = useState<'cola' | 'cita'>('cola');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  const [listaServicios, setListaServicios] = useState<ServicioOption[]>(
    APP_CONFIG.servicios
  );
  const [servicioSeleccionado, setServicioSeleccionado] = useState<ServicioOption>(
    APP_CONFIG.servicios[0]
  );

  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  const [fechaCita, setFechaCita] = useState<string>('');
  const [diasProximos, setDiasProximos] = useState<{ fecha: string; diaCorto: string; numDia: string }[]>([]);
  const [bloquesDisponibles, setBloquesDisponibles] = useState<any[]>([]);
  const [horaCitaSeleccionada, setHoraCitaSeleccionada] = useState<string>('');
  const [citaConfirmada, setCitaConfirmada] = useState<CitaCliente | null>(null);

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
    } catch {
      console.log('Audio no interactuado aún');
    }
  };

  useEffect(() => {
    const mananaInit = getMananaLocal();
    setFechaCita((prev) => prev || mananaInit);

    const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const listaDias = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      listaDias.push({
        fecha: `${y}-${m}-${day}`,
        diaCorto: diasNombres[d.getDay()],
        numDia: day,
      });
    }
    setDiasProximos(listaDias);

    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

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
            icono = '🪒';
          } else if (s.id === 'corte_barba' || s.nombre.includes('+')) {
            icono = '💈';
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

  const cargarHorarios = async () => {
    if (!fechaCita) return;
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
      setHoraCitaSeleccionada((prevHora) => (horasOcupadas.has(prevHora) ? '' : prevHora));
    }
  };

  useEffect(() => {
    if (modoRegistro !== 'cita' || !fechaCita) return;

    cargarHorarios();

    const channelCitasCliente = supabase
      .channel('cliente_bloques_citas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => {
        cargarHorarios();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'horarios_disponibles' }, () => {
        cargarHorarios();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelCitasCliente);
    };
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

  const agendarCita = async (e: React.FormEvent) => {
    e.preventDefault();

    const hoyStr = getHoyLocal();
    if (fechaCita <= hoyStr) {
      alert('Las citas solo se pueden reservar a partir del día de mañana.');
      return;
    }

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
      cargarHorarios();
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
    setHoraCitaSeleccionada('');
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
    return (
      <div className="p-12 text-center space-y-3 bg-[#002664] text-white">
        <div className="w-9 h-9 border-2 border-[#F2293A] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-bold">Cargando tu turno...</p>
      </div>
    );
  }

  if (citaConfirmada) {
    return (
      <div className="p-6 bg-[#002664] text-white text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-white border-4 border-[#F2293A] text-[#002664] flex items-center justify-center text-3xl mx-auto font-black">
          📅
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[#F2293A]">
            Cita Confirmada
          </p>
          <h2 className="text-4xl font-black text-white mt-1">{citaConfirmada.codigo_ticket}</h2>
          <p className="text-base font-bold text-white/95 mt-1">{citaConfirmada.nombre_cliente}</p>
        </div>

        <div className="p-4 rounded-xl bg-[#001B47] border border-white/15 text-sm space-y-2.5 text-left">
          <div className="flex justify-between">
            <span className="text-white/75">Fecha:</span>
            <span className="font-bold text-white">{citaConfirmada.fecha}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/75">Hora:</span>
            <span className="font-black text-[#F2293A]">{citaConfirmada.hora_inicio.substring(0, 5)} hrs</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/75">Servicio:</span>
            <span className="font-extrabold text-white">
              {citaConfirmada.tipo_corte} ({APP_CONFIG.monedaSimbolo}{citaConfirmada.monto})
            </span>
          </div>
        </div>

        <button
          onClick={volverAlInicio}
          className="w-full py-4 rounded-xl bg-[#F2293A] hover:bg-[#D91E2E] text-white font-black text-sm uppercase tracking-wider shadow-lg active:scale-95"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * APP_CONFIG.tiempoEstimadoPorClienteMin;
    const porcentajeProgreso =
      turno.estado === 'atendiendo' || turno.estado === 'finalizado'
        ? 100
        : Math.min(100, Math.max(12, Math.round(((totalInicialCola - personasAdelante) / totalInicialCola) * 100)));

    return (
      <div>
        <div
          className="p-5 text-white flex items-center justify-between"
          style={{
            backgroundColor: '#F2293A',
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 10px, rgba(0, 38, 100, 0.14) 10px, rgba(0, 38, 100, 0.14) 16px)',
          }}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-white border-2 border-[#002664] text-[#002664] flex items-center justify-center text-lg font-black shrink-0">
              {turno.codigo_ticket}
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider block text-white/95">
                Tu Turno · {horaActual}
              </span>
              <h2 className="text-lg font-black leading-tight">{turno.nombre_cliente}</h2>
              <p className="text-sm font-bold text-white">
                {turno.tipo_corte} · {APP_CONFIG.monedaSimbolo}{turno.monto}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 bg-[#002664] text-white space-y-4">
          {turno.estado === 'espera' && (
            <>
              <div className="p-4 rounded-xl bg-[#001B47] border border-white/15 space-y-2.5">
                <div className="flex justify-between text-sm font-extrabold">
                  <span>Progreso de fila</span>
                  <span className="text-[#F2293A]">{porcentajeProgreso}%</span>
                </div>
                <div className="w-full h-3 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full bg-[#F2293A] rounded-full transition-all duration-700"
                    style={{ width: `${porcentajeProgreso}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-white text-[#002664] text-center shadow">
                  <span className="text-xs font-black uppercase block">Delante de ti</span>
                  <p className="text-4xl font-black text-[#F2293A] mt-0.5">{personasAdelante}</p>
                  <span className="text-xs font-bold">clientes</span>
                </div>
                <div className="p-4 rounded-xl bg-[#001B47] border border-white/20 text-center">
                  <span className="text-xs font-black uppercase text-white/80 block">Espera aprox.</span>
                  <p className="text-4xl font-black text-white mt-0.5">{tiempoEstimado}m</p>
                  <span className="text-xs text-white/75 font-bold">estimados</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#001B47] border border-white/15 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-white/85">Modalidad:</span>
                  <span className="px-3 py-1 rounded bg-white text-[#002664] font-black text-xs">
                    {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Diligencia' : '💈 En el local'}
                  </span>
                </div>

                {turno.modalidad_espera === 'local' ? (
                  <button
                    type="button"
                    onClick={() => cambiarModalidadEnVivo('diligencia')}
                    className="w-full py-3 rounded-lg bg-white text-[#002664] font-black text-sm"
                  >
                    Salgo a diligencia ({APP_CONFIG.tiempoLimiteDiligenciaMin} min tolerancia)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => cambiarModalidadEnVivo('local')}
                    className="w-full py-3 rounded-lg bg-[#F2293A] text-white font-black text-sm"
                  >
                    Ya regresé a la barbería
                  </button>
                )}

                {distanciaKm !== null && turno.modalidad_espera === 'diligencia' && (
                  <p className="text-xs text-center text-white/85">
                    📍 Distancia al local: <strong>~{distanciaKm} km</strong>
                  </p>
                )}
              </div>

              <button
                onClick={cancelarTurno}
                className="w-full py-3.5 rounded-xl bg-[#F2293A] hover:bg-[#D91E2E] text-white font-black text-sm uppercase tracking-wider transition-all"
              >
                Cancelar mi turno
              </button>
            </>
          )}

          {turno.estado === 'atendiendo' && (
            <div className="p-6 rounded-xl bg-white text-[#002664] text-center space-y-4 shadow-xl">
              {turno.cliente_llego ? (
                <>
                  <span className="text-5xl block">💈</span>
                  <h2 className="text-2xl font-black text-[#F2293A]">¡Ya estás reportado!</h2>
                  <p className="text-sm font-bold">El barbero sabe que estás listo en el local.</p>
                </>
              ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
                <>
                  <span className="text-5xl block">🏃‍♂️</span>
                  <h2 className="text-xl font-black text-[#F2293A]">¡El barbero te está llamando!</h2>
                  <div className="py-3 px-5 rounded-xl bg-[#002664] text-white">
                    <span className="text-xs uppercase font-bold block">Tiempo para llegar</span>
                    <p className="text-4xl font-black font-mono mt-1">
                      {formatearTiempo(tiempoRestanteSegundos)}
                    </p>
                  </div>
                  <button
                    onClick={notificarLlegadaPresencial}
                    className="w-full py-4 rounded-xl bg-[#F2293A] text-white font-black text-sm uppercase tracking-wider shadow-lg active:scale-95"
                  >
                    📍 ¡Ya llegué al local!
                  </button>
                </>
              ) : (
                <>
                  <span className="text-5xl block">✂️</span>
                  <h2 className="text-2xl font-black text-[#F2293A]">¡Es tu turno!</h2>
                  <p className="text-sm font-bold">Pasa adelante, tu silla está lista.</p>
                </>
              )}
            </div>
          )}

          {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
            <div className="p-6 rounded-xl bg-white text-[#002664] text-center space-y-4">
              <span className="text-4xl block">{turno.estado === 'finalizado' ? '✨' : '⏳'}</span>
              <h2 className="text-xl font-black">
                {turno.estado === 'finalizado' ? '¡Gracias por tu visita!' : 'Tiempo agotado'}
              </h2>
              <button
                onClick={volverAlInicio}
                className="w-full py-4 rounded-xl bg-[#F2293A] text-white font-black text-sm uppercase tracking-wider"
              >
                Solicitar nuevo turno
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="px-6 pt-3 pb-6 text-center text-white space-y-3"
        style={{
          backgroundColor: '#F2293A',
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent, transparent 10px, rgba(0, 38, 100, 0.14) 10px, rgba(0, 38, 100, 0.14) 16px)',
        }}
      >
        <div>
          <h2 className="text-3xl font-black tracking-tight">Bienvenido</h2>
          <p className="text-sm font-extrabold text-[#002664] mt-0.5">
            - {nombre.trim() || APP_CONFIG.nombreNegocio || 'Pégate Ahí'} -
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-[#002664] p-1.5 rounded-xl">
          <button
            type="button"
            onClick={() => setModoRegistro('cola')}
            className={`py-2.5 rounded-lg text-sm font-black transition-all ${
              modoRegistro === 'cola'
                ? 'bg-white text-[#F2293A] shadow'
                : 'text-white/85 hover:text-white'
            }`}
          >
            ✂️ Turno Hoy
          </button>
          <button
            type="button"
            onClick={() => setModoRegistro('cita')}
            className={`py-2.5 rounded-lg text-sm font-black transition-all ${
              modoRegistro === 'cita'
                ? 'bg-white text-[#F2293A] shadow'
                : 'text-white/85 hover:text-white'
            }`}
          >
            📅 Agendar Cita
          </button>
        </div>
      </div>

      <form
        onSubmit={modoRegistro === 'cola' ? unirmeALaCola : agendarCita}
        className="p-6 bg-[#002664] text-white space-y-5"
      >
        <div>
          <h3 className="text-center text-xl font-black tracking-wide mb-3">Servicios</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {listaServicios.map((srv) => {
              const selected = servicioSeleccionado.nombre === srv.nombre;
              return (
                <button
                  type="button"
                  key={srv.id}
                  onClick={() => setServicioSeleccionado(srv)}
                  className={`p-3 rounded-xl bg-white text-[#002664] flex flex-col items-center justify-center text-center transition-all ${
                    selected
                      ? 'ring-4 ring-[#F2293A] scale-[1.03] shadow-lg'
                      : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  <span className="text-2xl mb-1">{srv.icono}</span>
                  <span className="text-xs font-black leading-snug">
                    {srv.nombre}
                  </span>
                  <span className="text-sm font-black text-[#F2293A] mt-0.5">
                    {APP_CONFIG.monedaSimbolo}{srv.precio}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            required
            placeholder="Tu nombre completo *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white text-[#002664] placeholder-slate-400 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#F2293A]"
          />
          <input
            type="tel"
            required
            placeholder="WhatsApp (Ej: 04141234567) *"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white text-[#002664] placeholder-slate-400 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#F2293A]"
          />
        </div>

        {modoRegistro === 'cola' && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setModalidadEspera('local')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                modalidadEspera === 'local'
                  ? 'bg-white text-[#002664] border-white font-black'
                  : 'bg-[#001B47] text-white/85 border-white/20'
              }`}
            >
              <p className="text-sm font-black">💈 En el Local</p>
              <p className="text-xs opacity-80 mt-0.5">Espero en barbería</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setModalidadEspera('diligencia');
                obtenerUbicacionGPS();
              }}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                modalidadEspera === 'diligencia'
                  ? 'bg-white text-[#002664] border-white font-black'
                  : 'bg-[#001B47] text-white/85 border-white/20'
              }`}
            >
              <p className="text-sm font-black">🏃‍♂️ Diligencia</p>
              <p className="text-xs opacity-80 mt-0.5">{APP_CONFIG.tiempoLimiteDiligenciaMin} min (GPS)</p>
            </button>
          </div>
        )}

        {modoRegistro === 'cita' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-black mb-2">Elige tu Día</p>
              <div className="grid grid-cols-6 gap-1.5 text-center">
                {diasProximos.map((d) => {
                  const isSelected = fechaCita === d.fecha;
                  return (
                    <button
                      key={d.fecha}
                      type="button"
                      onClick={() => {
                        setFechaCita(d.fecha);
                        setHoraCitaSeleccionada('');
                      }}
                      className={`py-2.5 rounded-lg flex flex-col items-center transition-all ${
                        isSelected
                          ? 'bg-[#F2293A] text-white font-black shadow'
                          : 'text-white/90 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-xs font-bold">{d.diaCorto}</span>
                      <span className="text-sm font-black mt-0.5">{d.numDia}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-black mb-2">Elige tu Hora</p>
              {bloquesDisponibles.length === 0 ? (
                <p className="text-xs text-white/80 text-center py-3.5 border border-dashed border-white/25 rounded-xl">
                  Sin horarios disponibles para este día.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-36 overflow-y-auto pr-0.5">
                  {bloquesDisponibles.map((b) => {
                    const horaText = b.hora_inicio.substring(0, 5);
                    const selected = horaCitaSeleccionada === b.hora_inicio;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setHoraCitaSeleccionada(b.hora_inicio)}
                        className={`py-2.5 text-sm font-black border-b-2 transition-all ${
                          selected
                            ? 'text-[#F2293A] border-[#F2293A]'
                            : 'text-white border-white/60 hover:border-white'
                        }`}
                      >
                        {horaText}
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
          className="w-full py-4 rounded-xl bg-[#F2293A] hover:bg-[#D91E2E] text-white font-black text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 disabled:opacity-40"
        >
          {registrando
            ? 'Procesando...'
            : modoRegistro === 'cola'
            ? 'Tomar Turno Ahora'
            : 'Confirmar Reserva'}
        </button>
      </form>
    </div>
  );
}

export default function ClienteView() {
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('light');
  const [esNoche, setEsNoche] = useState<boolean>(false);

  useEffect(() => {
    const hora = new Date().getHours();
    setEsNoche(hora >= 19 || hora < 6);
  }, []);

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 transition-colors duration-500 ${
        isDark ? 'bg-[#001233] text-white' : 'bg-[#EEF1F6] text-[#002664]'
      }`}
    >
      <div className="w-full max-w-[440px] rounded-[34px] shadow-2xl overflow-hidden bg-[#002664]">
        <div
          className="flex items-center justify-between px-6 pt-5 pb-2 text-white"
          style={{
            backgroundColor: '#F2293A',
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 10px, rgba(0, 38, 100, 0.14) 10px, rgba(0, 38, 100, 0.14) 16px)',
          }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-[#F2293A] text-xs font-black transition-all active:scale-95 shadow-xs"
          >
            ← Inicio
          </Link>

          <div className="flex items-center gap-1 p-1 rounded-full bg-[#002664]/85 text-xs font-bold">
            <button
              onClick={() => setModoTema('light')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'light' ? 'bg-white text-[#002664]' : 'text-white/80'
              }`}
            >
              ☀️
            </button>
            <button
              onClick={() => setModoTema('dark')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#F2293A] text-white' : 'text-white/80'
              }`}
            >
              🌙
            </button>
            <button
              onClick={() => setModoTema('auto')}
              className={`px-2.5 h-7 rounded-full transition-all ${
                modoTema === 'auto' ? 'bg-white text-[#002664]' : 'text-white/80'
              }`}
            >
              Auto
            </button>
          </div>
        </div>

        <Suspense fallback={<p className="text-center text-white text-sm py-10">Cargando...</p>}>
          <ClienteContent />
        </Suspense>

        <div className="h-7 bg-[#F2293A] flex items-center justify-center text-white text-sm font-black">
          ⌄
        </div>
      </div>
    </main>
  );
}
