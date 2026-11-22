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

  const [mananaStr, setMananaStr] = useState<string>(getMananaLocal);
  const [fechaCita, setFechaCita] = useState<string>(getMananaLocal);
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
    } catch (e) {
      console.log('Audio no interactuado aún');
    }
  };

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
      setMananaStr(getMananaLocal());
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
            icono = '🧔🏻';
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
    if (modoRegistro !== 'cita') return;

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

  // Clases temáticas inspiradas en la paleta Terracota + Carbón + Blanco Hueso
  const cardSurface = isDark
    ? 'bg-[#1D2229] border-[#2E353F] text-[#F4F3F1]'
    : 'bg-white border-[#E5E2DC] text-[#232931] shadow-[0_4px_20px_-4px_rgba(35,41,49,0.06)]';

  const inputSurface = isDark
    ? 'bg-[#1D2229] border-[#2E353F] text-[#F4F3F1] placeholder-[#7B8491]'
    : 'bg-white border-[#E5E2DC] text-[#232931] placeholder-[#9CA3AF] shadow-xs';

  if (loading) {
    return (
      <div className="py-16 text-center space-y-2">
        <div className="w-8 h-8 border-2 border-[#C47E52] border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs font-medium text-[#8C8881]">Preparando tu turno...</p>
      </div>
    );
  }

  // --- VISTA CITA CONFIRMADA ---
  if (citaConfirmada) {
    return (
      <div className="space-y-5">
        <div className={`p-6 rounded-3xl text-center border space-y-4 ${cardSurface}`}>
          <div className="w-14 h-14 rounded-full bg-[#C47E52]/15 text-[#C47E52] flex items-center justify-center text-2xl mx-auto">
            📅
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#C47E52]">
              Reserva Confirmada
            </p>
            <h2 className="text-4xl font-black tracking-tight mt-1">
              {citaConfirmada.codigo_ticket}
            </h2>
            <p className={`text-sm font-semibold mt-1 ${isDark ? 'text-neutral-300' : 'text-[#5C636E]'}`}>
              {citaConfirmada.nombre_cliente}
            </p>
          </div>

          <div className={`p-4 rounded-2xl text-xs space-y-2.5 text-left ${
            isDark ? 'bg-[#15191E]' : 'bg-[#F4F3F1]'
          }`}>
            <div className="flex justify-between">
              <span className="text-[#8C8881]">Fecha</span>
              <span className="font-bold">{citaConfirmada.fecha}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8C8881]">Hora</span>
              <span className="font-bold text-[#C47E52]">{citaConfirmada.hora_inicio.substring(0, 5)} hrs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8C8881]">WhatsApp</span>
              <span className="font-bold">{citaConfirmada.cliente_telefono}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-current/10">
              <span className="text-[#8C8881]">Servicio</span>
              <span className="font-extrabold">
                {citaConfirmada.tipo_corte} · {APP_CONFIG.monedaSimbolo}{citaConfirmada.monto}
              </span>
            </div>
          </div>

          <button
            onClick={volverAlInicio}
            className="w-full py-3.5 rounded-full bg-[#232931] hover:bg-[#191E24] text-white font-bold text-xs tracking-wide transition-all shadow-md active:scale-95"
          >
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  // --- MONITOR DE TURNO ACTIVO EN COLA ---
  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * APP_CONFIG.tiempoEstimadoPorClienteMin;
    const porcentajeProgreso =
      turno.estado === 'atendiendo' || turno.estado === 'finalizado'
        ? 100
        : Math.min(100, Math.max(12, Math.round(((totalInicialCola - personasAdelante) / totalInicialCola) * 100)));

    return (
      <div className="space-y-4">
        {/* Ticket Principal estilo Barber Card */}
        <div className={`p-5 rounded-3xl border flex items-center justify-between ${cardSurface}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full bg-[#C47E52]/20 border border-[#C47E52]/40 flex items-center justify-center text-2xl shrink-0">
              💈
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#C47E52]">
                  Ticket {turno.codigo_ticket}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C47E52]/15 text-[#C47E52] font-bold">
                  {horaActual}
                </span>
              </div>
              <h2 className="text-lg font-extrabold leading-tight mt-0.5">{turno.nombre_cliente}</h2>
              <p className="text-xs text-[#8C8881] mt-0.5">
                {turno.tipo_corte} · <span className="font-bold text-[#C47E52]">{APP_CONFIG.monedaSimbolo}{turno.monto}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Estado: EN ESPERA */}
        {turno.estado === 'espera' && (
          <div className="space-y-4">
            {/* Progreso */}
            <div className={`p-4 rounded-2xl border space-y-2.5 ${cardSurface}`}>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold">Progreso de tu turno</span>
                <span className="font-extrabold text-[#C47E52]">{porcentajeProgreso}%</span>
              </div>
              <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-[#15191E]' : 'bg-[#EFECE6]'}`}>
                <div
                  className="h-full bg-[#C47E52] rounded-full transition-all duration-700"
                  style={{ width: `${porcentajeProgreso}%` }}
                />
              </div>
            </div>

            {/* Métricas en tarjetas compactas */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-2xl border text-center ${cardSurface}`}>
                <span className="text-[11px] font-semibold text-[#8C8881] block">Delante de ti</span>
                <p className="text-3xl font-black mt-1">{personasAdelante}</p>
                <span className="text-[10px] text-[#C47E52] font-semibold">clientes</span>
              </div>
              <div className={`p-4 rounded-2xl border text-center ${cardSurface}`}>
                <span className="text-[11px] font-semibold text-[#8C8881] block">Espera aprox.</span>
                <p className="text-3xl font-black text-[#C47E52] mt-1">{tiempoEstimado}m</p>
                <span className="text-[10px] text-[#8C8881] font-semibold">estimados</span>
              </div>
            </div>

            {/* Cambio de modalidad Local / Diligencia */}
            <div className={`p-4 rounded-2xl border space-y-3 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Ubicación actual</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#C47E52]/15 text-[#C47E52]">
                  {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Haciendo diligencia' : '💈 En el local'}
                </span>
              </div>

              {turno.modalidad_espera === 'local' ? (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className="w-full py-3 rounded-full bg-[#232931] hover:bg-[#1A1F25] text-white font-bold text-xs transition-all active:scale-95"
                >
                  Salgo a diligencia ({APP_CONFIG.tiempoLimiteDiligenciaMin} min tolerancia)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className="w-full py-3 rounded-full bg-[#C47E52] hover:bg-[#B36E43] text-white font-bold text-xs transition-all active:scale-95"
                >
                  Ya regresé a la barbería
                </button>
              )}

              {distanciaKm !== null && turno.modalidad_espera === 'diligencia' && (
                <p className="text-[11px] text-center text-[#8C8881]">
                  📍 Distancia al local: <strong className="text-[#C47E52]">~{distanciaKm} km</strong>
                </p>
              )}
            </div>

            <button
              onClick={cancelarTurno}
              className="w-full py-3 rounded-full border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-bold text-xs transition-all"
            >
              Cancelar mi turno
            </button>
          </div>
        )}

        {/* Estado: LLAMADO / ATENDIENDO */}
        {turno.estado === 'atendiendo' && (
          <div className={`p-6 rounded-3xl border-2 border-[#C47E52] text-center space-y-4 ${cardSurface}`}>
            {turno.cliente_llego ? (
              <>
                <span className="text-4xl block">💈</span>
                <h2 className="text-xl font-black">¡Ya estás reportado!</h2>
                <p className="text-xs text-[#8C8881]">El barbero sabe que estás listo para pasar a la silla.</p>
              </>
            ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <>
                <span className="text-4xl block">🏃‍♂️</span>
                <h2 className="text-lg font-black text-[#C47E52] uppercase">¡El barbero te está llamando!</h2>
                <div className={`py-4 px-5 rounded-2xl ${isDark ? 'bg-[#15191E]' : 'bg-[#F4F3F1]'}`}>
                  <span className="text-[10px] uppercase font-bold text-[#8C8881] block">Tiempo para llegar</span>
                  <p className="text-4xl font-black font-mono text-[#C47E52] mt-1">
                    {formatearTiempo(tiempoRestanteSegundos)}
                  </p>
                </div>
                <button
                  onClick={notificarLlegadaPresencial}
                  className="w-full py-3.5 rounded-full bg-[#C47E52] hover:bg-[#B36E43] text-white font-bold text-xs uppercase tracking-wide shadow-lg active:scale-95"
                >
                  📍 ¡Ya llegué al local!
                </button>
              </>
            ) : (
              <>
                <span className="text-4xl block">✂️</span>
                <h2 className="text-2xl font-black">¡Es tu turno!</h2>
                <p className="text-xs text-[#8C8881]">Pasa adelante, tu silla está lista.</p>
              </>
            )}
          </div>
        )}

        {/* Estado: FINALIZADO / AUSENTE */}
        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className={`p-6 rounded-3xl border text-center space-y-4 ${cardSurface}`}>
            <span className="text-3xl block">{turno.estado === 'finalizado' ? '✨' : '⏳'}</span>
            <h2 className="text-lg font-extrabold">
              {turno.estado === 'finalizado' ? '¡Gracias por tu visita!' : 'Tiempo de espera agotado'}
            </h2>
            <button
              onClick={volverAlInicio}
              className="w-full py-3.5 rounded-full bg-[#232931] hover:bg-[#191E24] text-white font-bold text-xs transition-all active:scale-95"
            >
              Solicitar Nuevo Turno
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- PANTALLA DE INICIO / REGISTRO ESTILO APP MÓVIL ---
  return (
    <div className="space-y-5">
      {/* Saludo estilo "Hello! Cliente" de la referencia */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xl font-extrabold leading-tight">¡Hola!</p>
          <p className="text-lg font-bold text-[#C47E52] leading-tight">
            {nombre.trim() ? nombre.trim().split(' ')[0] : 'Bienvenido'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full ${
            isDark ? 'bg-[#1D2229] text-[#C47E52]' : 'bg-white text-[#232931] border border-[#E5E2DC]'
          }`}>
            {horaActual}
          </span>
          <div className="w-10 h-10 rounded-full bg-[#C47E52]/20 border border-[#C47E52]/40 flex items-center justify-center text-lg">
            🧔🏻
          </div>
        </div>
      </div>

      {/* Píldoras de Categoría (Tabs estilo "All | Services | Price") */}
      <div>
        <p className="text-xs font-bold mb-2.5">Modalidad</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModoRegistro('cola')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              modoRegistro === 'cola'
                ? 'bg-[#232931] text-white shadow-sm'
                : isDark
                ? 'bg-[#1D2229] text-[#8C8881] hover:text-white'
                : 'bg-white text-[#5C636E] border border-[#E5E2DC]'
            }`}
          >
            Cola Hoy
          </button>
          <button
            type="button"
            onClick={() => setModoRegistro('cita')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              modoRegistro === 'cita'
                ? 'bg-[#232931] text-white shadow-sm'
                : isDark
                ? 'bg-[#1D2229] text-[#8C8881] hover:text-white'
                : 'bg-white text-[#5C636E] border border-[#E5E2DC]'
            }`}
          >
            Cita Previa
          </button>
        </div>
      </div>

      <form onSubmit={modoRegistro === 'cola' ? unirmeALaCola : agendarCita} className="space-y-4">
        {/* Servicios en cuadrícula de 3 tarjetas cuadradas como en la 3ra pantalla de la imagen */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold">Servicios</span>
            <span className="text-[11px] font-bold text-[#C47E52]">
              {servicioSeleccionado.nombre} · {APP_CONFIG.monedaSimbolo}{servicioSeleccionado.precio}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {listaServicios.map((srv) => {
              const selected = servicioSeleccionado.nombre === srv.nombre;
              return (
                <button
                  type="button"
                  key={srv.id}
                  onClick={() => setServicioSeleccionado(srv)}
                  className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${
                    selected
                      ? isDark
                        ? 'bg-[#232931] border-[#C47E52] ring-1 ring-[#C47E52]'
                        : 'bg-white border-[#232931] ring-1 ring-[#232931] shadow-sm'
                      : isDark
                      ? 'bg-[#1D2229] border-[#2E353F] opacity-75 hover:opacity-100'
                      : 'bg-white border-[#E5E2DC] opacity-80 hover:opacity-100'
                  }`}
                >
                  <span className="text-2xl mb-1.5">{srv.icono}</span>
                  <span className="text-[11px] font-bold leading-tight line-clamp-1">{srv.nombre}</span>
                  <span className="text-[11px] font-extrabold text-[#C47E52] mt-0.5">
                    {APP_CONFIG.monedaSimbolo}{srv.precio}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Datos del cliente con inputs redondeados limpios */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold block">Tus Datos</span>
          <input
            type="text"
            required
            placeholder="Tu nombre completo *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={`w-full px-4 py-3 rounded-2xl border text-xs font-medium focus:outline-none focus:border-[#C47E52] transition-all ${inputSurface}`}
          />
          <input
            type="tel"
            required
            placeholder="WhatsApp (Ej: 04141234567) *"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={`w-full px-4 py-3 rounded-2xl border text-xs font-medium focus:outline-none focus:border-[#C47E52] transition-all ${inputSurface}`}
          />
        </div>

        {/* Opciones de Cola Presencial */}
        {modoRegistro === 'cola' && (
          <div className="space-y-2">
            <span className="text-xs font-bold block">¿Dónde esperarás?</span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setModalidadEspera('local')}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  modalidadEspera === 'local'
                    ? isDark
                      ? 'bg-[#232931] border-[#C47E52]'
                      : 'bg-white border-[#232931] shadow-xs'
                    : isDark
                    ? 'bg-[#1D2229] border-[#2E353F] opacity-70'
                    : 'bg-white border-[#E5E2DC] opacity-75'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">💈</span>
                  {modalidadEspera === 'local' && <span className="w-2 h-2 rounded-full bg-[#C47E52]" />}
                </div>
                <p className="text-xs font-bold">En el Local</p>
                <p className="text-[10px] text-[#8C8881]">Espero en barbería</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalidadEspera('diligencia');
                  obtenerUbicacionGPS();
                }}
                className={`p-3 rounded-2xl border text-left transition-all ${
                  modalidadEspera === 'diligencia'
                    ? isDark
                      ? 'bg-[#232931] border-[#C47E52]'
                      : 'bg-white border-[#232931] shadow-xs'
                    : isDark
                    ? 'bg-[#1D2229] border-[#2E353F] opacity-70'
                    : 'bg-white border-[#E5E2DC] opacity-75'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">🏃‍♂️</span>
                  {modalidadEspera === 'diligencia' && <span className="w-2 h-2 rounded-full bg-[#C47E52]" />}
                </div>
                <p className="text-xs font-bold">Diligencia</p>
                <p className="text-[10px] text-[#8C8881]">{APP_CONFIG.tiempoLimiteDiligenciaMin} min (GPS)</p>
              </button>
            </div>
          </div>
        )}

        {/* Opciones de Cita Previa (estilo "Select schedule" con píldoras de reloj) */}
        {modoRegistro === 'cita' && (
          <div className="space-y-3">
            <div>
              <span className="text-xs font-bold block mb-1.5">Fecha (a partir de mañana)</span>
              <input
                type="date"
                min={mananaStr}
                value={fechaCita}
                onChange={(e) => {
                  setFechaCita(e.target.value);
                  setHoraCitaSeleccionada('');
                }}
                className={`w-full px-4 py-2.5 rounded-2xl border text-xs font-bold focus:outline-none focus:border-[#C47E52] ${inputSurface}`}
              />
            </div>

            <div>
              <span className="text-xs font-bold block mb-2">Select schedule</span>
              {bloquesDisponibles.length === 0 ? (
                <p className="text-[11px] text-[#8C8881] text-center py-4 border border-dashed border-current/15 rounded-2xl">
                  Sin horarios disponibles para esta fecha.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                  {bloquesDisponibles.map((b) => {
                    const horaText = b.hora_inicio.substring(0, 5);
                    const selected = horaCitaSeleccionada === b.hora_inicio;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setHoraCitaSeleccionada(b.hora_inicio)}
                        className={`py-2 px-2 rounded-full text-[11px] font-bold border flex items-center justify-center gap-1 transition-all ${
                          selected
                            ? 'bg-[#232931] text-white border-[#232931] shadow-sm'
                            : isDark
                            ? 'bg-[#1D2229] text-[#D1D5DB] border-[#2E353F] hover:border-[#C47E52]'
                            : 'bg-white text-[#232931] border-[#E5E2DC] hover:border-[#232931]'
                        }`}
                      >
                        <span>🕒</span> {horaText}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Botón principal estilo "Book Now" oscuro carbón */}
        <button
          type="submit"
          disabled={registrando || !nombre.trim() || !telefono.trim() || (modoRegistro === 'cita' && !horaCitaSeleccionada)}
          className={`w-full py-3.5 rounded-full font-bold text-xs tracking-wide transition-all shadow-md active:scale-95 disabled:opacity-40 ${
            isDark
              ? 'bg-[#C47E52] hover:bg-[#B36E43] text-white'
              : 'bg-[#232931] hover:bg-[#181C22] text-white'
          }`}
        >
          {registrando
            ? 'Procesando...'
            : modoRegistro === 'cola'
            ? 'Tomar Turno Ahora'
            : 'Reservar Cita'}
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
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 transition-colors duration-500 ${
        isDark ? 'bg-[#0F1216] text-[#F4F3F1]' : 'bg-[#C47E52] text-[#232931]'
      }`}
    >
      {/* Contenedor tipo Smartphone de la referencia (380px-420px, esquinas 36px) */}
      <div
        className={`w-full max-w-[410px] rounded-[36px] p-6 shadow-2xl border transition-colors duration-500 ${
          isDark
            ? 'bg-[#15191E] border-[#262C35]'
            : 'bg-[#F4F3F1] border-white/60'
        }`}
      >
        {/* Barra superior minimalista */}
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#C47E52] text-white flex items-center justify-center text-sm font-black shadow-xs">
              ✂️
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight uppercase leading-none">
                {APP_CONFIG.nombreNegocio}
              </h1>
              <p className="text-[10px] text-[#8C8881] font-medium mt-0.5">
                {APP_CONFIG.subtitulo}
              </p>
            </div>
          </div>

          {/* Selector de tema compacto */}
          <div
            className={`flex items-center gap-0.5 p-1 rounded-full border text-[10px] font-bold ${
              isDark ? 'bg-[#1D2229] border-[#2E353F]' : 'bg-white border-[#E5E2DC]'
            }`}
          >
            <button
              onClick={() => setModoTema('light')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'light' ? 'bg-[#232931] text-white' : 'text-[#8C8881]'
              }`}
              title="Modo Claro"
            >
              ☀️
            </button>
            <button
              onClick={() => setModoTema('dark')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#C47E52] text-white' : 'text-[#8C8881]'
              }`}
              title="Modo Oscuro"
            >
              🌙
            </button>
            <button
              onClick={() => setModoTema('auto')}
              className={`px-2 h-6 rounded-full transition-all ${
                modoTema === 'auto'
                  ? isDark
                    ? 'bg-[#C47E52] text-white'
                    : 'bg-[#232931] text-white'
                  : 'text-[#8C8881]'
              }`}
            >
              Auto
            </button>
          </div>
        </header>

        <Suspense fallback={<p className="text-center text-[#8C8881] text-xs py-10">Cargando...</p>}>
          <ClienteContent isDark={isDark} />
        </Suspense>
      </div>
    </main>
  );
}
