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

// Colores vibrantes de las tarjetas de servicio de la imagen (Amarillo, Rojo, Turquesa)
const BLOQUES_COLOR = [
  { bg: 'bg-[#F5D042]', text: 'text-[#072742]', sub: 'text-[#072742]/80' },
  { bg: 'bg-[#C62828]', text: 'text-white', sub: 'text-white/85' },
  { bg: 'bg-[#37B9C5]', text: 'text-[#072742]', sub: 'text-[#072742]/80' },
];

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

  const [mananaStr, setMananaStr] = useState<string>('');
  const [fechaCita, setFechaCita] = useState<string>('');
  const [diasProximos, setDiasProximos] = useState<{ fecha: string; diaCorto: string; numDia: string; mesNombre: string }[]>([]);
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
    setMananaStr(mananaInit);
    setFechaCita((prev) => prev || mananaInit);

    // Generar tira de 7 días futuros estilo calendario de la 3ra pantalla
    const diasNombres = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
    const mesesNombres = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const listaDias = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      listaDias.push({
        fecha: `${y}-${m}-${day}`,
        diaCorto: diasNombres[d.getDay()],
        numDia: day,
        mesNombre: mesesNombres[d.getMonth()],
      });
    }
    setDiasProximos(listaDias);

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

  const mesActivoObj = diasProximos.find((d) => d.fecha === fechaCita) || diasProximos[0];

  if (loading) {
    return (
      <div className="py-16 text-center space-y-2">
        <div className="w-8 h-8 border-2 border-[#F5D042] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-300">Cargando tu turno...</p>
      </div>
    );
  }

  // --- CITA CONFIRMADA ---
  if (citaConfirmada) {
    return (
      <div className="space-y-4">
        <div className="p-6 rounded-2xl bg-[#0B3559] border-2 border-[#F5D042] text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#F5D042] text-[#072742] flex items-center justify-center text-2xl mx-auto font-black">
            📅
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-[#37B9C5]">
              RESERVA CONFIRMADA
            </p>
            <h2 className="text-4xl font-black text-white mt-1">{citaConfirmada.codigo_ticket}</h2>
            <p className="text-sm font-bold text-[#F5D042] mt-0.5">{citaConfirmada.nombre_cliente}</p>
          </div>

          <div className="p-4 rounded-xl bg-[#04182B] text-xs space-y-2 text-left">
            <div className="flex justify-between">
              <span className="text-slate-400">Fecha:</span>
              <span className="font-bold text-white">{citaConfirmada.fecha}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Hora:</span>
              <span className="font-black text-[#37B9C5]">{citaConfirmada.hora_inicio.substring(0, 5)} hrs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Servicio:</span>
              <span className="font-extrabold text-[#F5D042]">
                {citaConfirmada.tipo_corte} ({APP_CONFIG.monedaSimbolo}{citaConfirmada.monto})
              </span>
            </div>
          </div>

          <button
            onClick={volverAlInicio}
            className="w-full py-3.5 rounded-xl bg-[#C62828] hover:bg-[#B02020] text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95"
          >
            VOLVER AL INICIO
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
        {/* Ticket en bloque Turquesa */}
        <div className="p-4 rounded-2xl bg-[#37B9C5] text-[#072742] flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#072742] text-[#F5D042] flex items-center justify-center text-lg font-black shrink-0">
              {turno.codigo_ticket}
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider block opacity-80">
                TU TICKET · {horaActual}
              </span>
              <h2 className="text-base font-black leading-tight">{turno.nombre_cliente}</h2>
              <p className="text-xs font-bold">
                {turno.tipo_corte} · {APP_CONFIG.monedaSimbolo}{turno.monto}
              </p>
            </div>
          </div>
        </div>

        {turno.estado === 'espera' && (
          <div className="space-y-3.5">
            <div className="p-4 rounded-2xl bg-[#0B3559] border border-[#144673] space-y-2">
              <div className="flex justify-between text-xs font-extrabold">
                <span className="text-white">PROGRESO DE FILA</span>
                <span className="text-[#F5D042]">{porcentajeProgreso}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-[#04182B] overflow-hidden">
                <div
                  className="h-full bg-[#F5D042] rounded-full transition-all duration-700"
                  style={{ width: `${porcentajeProgreso}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-[#F5D042] text-[#072742] text-center shadow-md">
                <span className="text-[10px] font-black uppercase block">DELANTE DE TI</span>
                <p className="text-3xl font-black mt-0.5">{personasAdelante}</p>
                <span className="text-[10px] font-bold uppercase">clientes</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#0B3559] border border-[#37B9C5]/40 text-center">
                <span className="text-[10px] font-black uppercase text-[#37B9C5] block">ESPERA APROX.</span>
                <p className="text-3xl font-black text-white mt-0.5">{tiempoEstimado}m</p>
                <span className="text-[10px] text-slate-300 font-bold uppercase">estimados</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#0B3559] border border-[#144673] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Modalidad:</span>
                <span className="px-2.5 py-0.5 rounded bg-[#37B9C5] text-[#072742] font-black text-[10px] uppercase">
                  {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Diligencia' : '💈 En el local'}
                </span>
              </div>

              {turno.modalidad_espera === 'local' ? (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className="w-full py-3 rounded-xl bg-[#04182B] hover:bg-[#08243E] border border-[#F5D042]/50 text-[#F5D042] font-extrabold text-xs uppercase tracking-wide"
                >
                  Salgo a diligencia ({APP_CONFIG.tiempoLimiteDiligenciaMin} min tolerancia)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className="w-full py-3 rounded-xl bg-[#37B9C5] text-[#072742] font-black text-xs uppercase tracking-wide"
                >
                  Ya regresé a la barbería
                </button>
              )}

              {distanciaKm !== null && turno.modalidad_espera === 'diligencia' && (
                <p className="text-[11px] text-center text-slate-300">
                  📍 Distancia al local: <strong className="text-[#F5D042]">~{distanciaKm} km</strong>
                </p>
              )}
            </div>

            <button
              onClick={cancelarTurno}
              className="w-full py-3 rounded-xl bg-[#C62828]/20 border border-[#C62828] text-[#FF8A80] hover:bg-[#C62828] hover:text-white font-black text-xs uppercase tracking-wider transition-all"
            >
              CANCELAR MI TURNO
            </button>
          </div>
        )}

        {turno.estado === 'atendiendo' && (
          <div className="p-6 rounded-2xl bg-[#C62828] text-white text-center space-y-4 shadow-xl">
            {turno.cliente_llego ? (
              <>
                <span className="text-4xl block">💈</span>
                <h2 className="text-xl font-black uppercase">¡Ya estás reportado!</h2>
                <p className="text-xs text-white/90">El barbero sabe que estás listo en el local.</p>
              </>
            ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <>
                <span className="text-4xl block">🏃‍♂️</span>
                <h2 className="text-lg font-black uppercase">¡El barbero te está llamando!</h2>
                <div className="py-3 px-5 rounded-xl bg-[#072742]">
                  <span className="text-[10px] uppercase font-bold text-[#37B9C5] block">Tiempo para llegar</span>
                  <p className="text-4xl font-black font-mono text-[#F5D042] mt-1">
                    {formatearTiempo(tiempoRestanteSegundos)}
                  </p>
                </div>
                <button
                  onClick={notificarLlegadaPresencial}
                  className="w-full py-3.5 rounded-xl bg-[#F5D042] text-[#072742] font-black text-xs uppercase tracking-wider shadow-lg active:scale-95"
                >
                  📍 ¡YA LLEGUÉ AL LOCAL!
                </button>
              </>
            ) : (
              <>
                <span className="text-4xl block">✂️</span>
                <h2 className="text-2xl font-black uppercase">¡ES TU TURNO!</h2>
                <p className="text-xs text-white/90">Pasa adelante, tu silla está lista.</p>
              </>
            )}
          </div>
        )}

        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className="p-6 rounded-2xl bg-[#0B3559] border border-[#37B9C5]/40 text-center space-y-4">
            <span className="text-3xl block">{turno.estado === 'finalizado' ? '✨' : '⏳'}</span>
            <h2 className="text-lg font-black uppercase text-white">
              {turno.estado === 'finalizado' ? '¡Gracias por tu visita!' : 'Tiempo agotado'}
            </h2>
            <button
              onClick={volverAlInicio}
              className="w-full py-3.5 rounded-xl bg-[#C62828] text-white font-black text-xs uppercase tracking-wider"
            >
              SOLICITAR NUEVO TURNO
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- PANTALLA DE SELECCIÓN ESTILO "SERVICE" & "APPOINTMENT BOOKING" ---
  return (
    <div className="space-y-4">
      {/* Switch Cola Hoy / Cita Previa */}
      <div className="grid grid-cols-2 gap-2 bg-[#04182B] p-1.5 rounded-xl border border-[#143F66]">
        <button
          type="button"
          onClick={() => setModoRegistro('cola')}
          className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
            modoRegistro === 'cola'
              ? 'bg-[#C62828] text-white shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          ✂️ Cola Hoy
        </button>
        <button
          type="button"
          onClick={() => setModoRegistro('cita')}
          className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
            modoRegistro === 'cita'
              ? 'bg-[#F5D042] text-[#072742] shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          📅 Cita Previa
        </button>
      </div>

      <form onSubmit={modoRegistro === 'cola' ? unirmeALaCola : agendarCita} className="space-y-4">
        {/* Sección SERVICE con cuadros vibrantes Amarillo / Rojo / Turquesa como la 2da pantalla */}
        <div>
          <div className="text-center mb-2.5">
            <h2 className="text-lg font-black tracking-widest uppercase text-white">SERVICE</h2>
            <p className="text-[11px] text-[#37B9C5] font-bold">
              {servicioSeleccionado.nombre} · {APP_CONFIG.monedaSimbolo}{servicioSeleccionado.precio}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {listaServicios.map((srv, idx) => {
              const color = BLOQUES_COLOR[idx % BLOQUES_COLOR.length];
              const selected = servicioSeleccionado.nombre === srv.nombre;
              return (
                <button
                  type="button"
                  key={srv.id}
                  onClick={() => setServicioSeleccionado(srv)}
                  className={`p-3 rounded-2xl flex flex-col items-center justify-center text-center transition-all ${color.bg} ${color.text} ${
                    selected
                      ? 'ring-4 ring-white scale-[1.03] shadow-xl'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  <span className="text-2xl mb-1">{srv.icono}</span>
                  <span className="text-[10px] font-black uppercase leading-tight line-clamp-1">
                    {srv.nombre}
                  </span>
                  <span className={`text-xs font-black mt-0.5 ${color.sub}`}>
                    {APP_CONFIG.monedaSimbolo}{srv.precio}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Inputs estilo barra blanca redondeada de la 2da pantalla */}
        <div className="space-y-2">
          <input
            type="text"
            required
            placeholder="Tu nombre completo *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-4 py-2.5 rounded-full bg-white text-[#072742] placeholder-slate-400 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#37B9C5]"
          />
          <input
            type="tel"
            required
            placeholder="WhatsApp (Ej: 04141234567) *"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full px-4 py-2.5 rounded-full bg-white text-[#072742] placeholder-slate-400 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#37B9C5]"
          />
        </div>

        {/* Modalidad de espera si es Cola Hoy */}
        {modoRegistro === 'cola' && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setModalidadEspera('local')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                modalidadEspera === 'local'
                  ? 'bg-[#37B9C5] border-white text-[#072742]'
                  : 'bg-[#0B3559] border-[#144673] text-white opacity-80'
              }`}
            >
              <p className="text-xs font-black uppercase">💈 En el Local</p>
              <p className="text-[10px] font-semibold opacity-80">Espero en barbería</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setModalidadEspera('diligencia');
                obtenerUbicacionGPS();
              }}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                modalidadEspera === 'diligencia'
                  ? 'bg-[#F5D042] border-white text-[#072742]'
                  : 'bg-[#0B3559] border-[#144673] text-white opacity-80'
              }`}
            >
              <p className="text-xs font-black uppercase">🏃‍♂️ Diligencia</p>
              <p className="text-[10px] font-semibold opacity-80">{APP_CONFIG.tiempoLimiteDiligenciaMin} min (GPS)</p>
            </button>
          </div>
        )}

        {/* Calendario estilo 3ra pantalla ("APPOINTMENT BOOKING" con barra amarilla y días en tarjetas blancas/roja) */}
        {modoRegistro === 'cita' && (
          <div className="space-y-3 pt-1">
            <p className="text-center text-xs font-black tracking-widest uppercase text-[#C62828]">
              APPOINTMENT BOOKING
            </p>

            {/* Barra amarilla del mes */}
            <div className="flex items-center justify-between px-3">
              <span className="text-white font-black text-sm">‹</span>
              <div className="px-6 py-1.5 rounded-lg bg-[#F5D042] text-[#072742] font-black text-xs uppercase tracking-widest shadow">
                {mesActivoObj ? mesActivoObj.mesNombre : 'SELECCIONA DÍA'}
              </div>
              <span className="text-white font-black text-sm">›</span>
            </div>

            {/* Tira de 7 días estilo calendario */}
            <div className="grid grid-cols-7 gap-1 pt-1 border-t border-b border-white/15 py-2.5">
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
                    className={`py-2 rounded-lg flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-[#C62828] text-white scale-105 shadow-md'
                        : 'bg-white text-[#072742] hover:bg-[#F5D042]'
                    }`}
                  >
                    <span className="text-[8px] font-black uppercase">{d.diaCorto}</span>
                    <span className="text-xs font-black mt-0.5">{d.numDia}</span>
                  </button>
                );
              })}
            </div>

            {/* Selector de hora estilo "SELECT A TIME" con cuadro turquesa */}
            <div>
              <p className="text-center text-[11px] font-black uppercase tracking-widest text-white mb-2">
                SELECT A TIME
              </p>
              {bloquesDisponibles.length === 0 ? (
                <p className="text-[11px] text-slate-300 text-center py-3 border border-dashed border-white/20 rounded-xl">
                  Sin horarios disponibles para este día.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto pr-0.5">
                  {bloquesDisponibles.map((b) => {
                    const horaText = b.hora_inicio.substring(0, 5);
                    const selected = horaCitaSeleccionada === b.hora_inicio;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setHoraCitaSeleccionada(b.hora_inicio)}
                        className={`py-2 rounded-lg text-xs font-black transition-all ${
                          selected
                            ? 'bg-[#37B9C5] text-[#072742] ring-2 ring-white shadow'
                            : 'bg-[#0B3559] text-white border border-[#144673] hover:border-[#37B9C5]'
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

        {/* Botón Rojo "BOOK NOW" de la 3ra pantalla */}
        <button
          type="submit"
          disabled={registrando || !nombre.trim() || !telefono.trim() || (modoRegistro === 'cita' && !horaCitaSeleccionada)}
          className="w-full py-3.5 rounded-xl bg-[#C62828] hover:bg-[#B02020] text-white font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-40"
        >
          {registrando
            ? 'PROCESANDO...'
            : modoRegistro === 'cola'
            ? 'TOMAR TURNO AHORA'
            : 'BOOK NOW'}
        </button>
      </form>
    </div>
  );
}

export default function ClienteView() {
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('dark');
  const [esNoche, setEsNoche] = useState<boolean>(true);

  useEffect(() => {
    const hora = new Date().getHours();
    setEsNoche(hora >= 19 || hora < 6);
  }, []);

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 transition-colors duration-500 ${
        isDark ? 'bg-[#041626] text-white' : 'bg-[#D6D8DC] text-[#072742]'
      }`}
    >
      <div className="w-full max-w-[410px] rounded-[34px] p-6 shadow-2xl border-2 bg-[#072742] border-[#123D63] text-white">
        {/* Barra superior con botón Volver al Inicio y Tema */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#04182B] border border-[#143F66] text-[#37B9C5] hover:border-[#F5D042] text-[11px] font-black uppercase transition-all"
          >
            ← Inicio
          </Link>

          <div className="flex items-center gap-0.5 p-1 rounded-full bg-[#04182B] border border-[#143F66] text-[10px] font-bold">
            <button
              onClick={() => setModoTema('light')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'light' ? 'bg-[#F5D042] text-[#072742]' : 'text-slate-400'
              }`}
            >
              ☀️
            </button>
            <button
              onClick={() => setModoTema('dark')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#C62828] text-white' : 'text-slate-400'
              }`}
            >
              🌙
            </button>
            <button
              onClick={() => setModoTema('auto')}
              className={`px-2 h-6 rounded-full transition-all ${
                modoTema === 'auto' ? 'bg-[#37B9C5] text-[#072742]' : 'text-slate-400'
              }`}
            >
              Auto
            </button>
          </div>
        </div>

        <Suspense fallback={<p className="text-center text-slate-300 text-xs py-10">Cargando...</p>}>
          <ClienteContent />
        </Suspense>
      </div>
    </main>
  );
}
