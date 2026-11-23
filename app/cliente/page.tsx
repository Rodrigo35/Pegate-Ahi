'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { APP_CONFIG } from '../../lib/config';

interface SillaActiva {
  id: string;
  nombre_silla: string;
  nombre_barbero: string;
}

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  silla_id?: string | null;
  nombre_barbero?: string | null;
  barbero_preferido?: string | null;
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
  barbero_preferido?: string | null;
  estado: string;
}

interface ServicioOption {
  id: string;
  nombre: string;
  precio: number;
  icono: string;
  descripcion?: string;
}

const STORAGE_KEY = 'pegate_ahi_registro_activo';
const THEME_STORAGE_KEY = 'pegate_ahi_tema';

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

function ClienteContent({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');
  const citaParam = searchParams.get('cita');

  const [modoRegistro, setModoRegistro] = useState<'cola' | 'cita'>('cola');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  const [listaServicios, setListaServicios] = useState<ServicioOption[]>(
    APP_CONFIG.servicios
  );
  const [servicioSeleccionado, setServicioSeleccionado] = useState<ServicioOption>(
    APP_CONFIG.servicios[0]
  );

  const [sillasActivas, setSillasActivas] = useState<SillaActiva[]>([]);
  const [barberoPreferido, setBarberoPreferido] = useState<string>('');
  const sillasActivasCount = Math.max(1, sillasActivas.length);

  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [reseteando, setReseteando] = useState<boolean>(false);

  const [fechaCita, setFechaCita] = useState<string>('');
  const [diasProximos, setDiasProximos] = useState<
    { fecha: string; diaCorto: string; numDia: string; mesCorto: string }[]
  >([]);
  const [bloquesDisponibles, setBloquesDisponibles] = useState<any[]>([]);
  const [horaCitaSeleccionada, setHoraCitaSeleccionada] = useState<string>('');
  const [citaConfirmada, setCitaConfirmada] = useState<CitaCliente | null>(null);

  const [horaActual, setHoraActual] = useState<string>('');
  const [tiempoRestanteSegundos, setTiempoRestanteSegundos] = useState<number | null>(null);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);

  const guardarPersistencia = (tipo: 'turno' | 'cita', codigo: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tipo, codigo }));
    } catch {
      // Ignorar si localStorage está restringido
    }
    const paramName = tipo === 'turno' ? 'ticket' : 'cita';
    router.replace(`/cliente?${paramName}=${encodeURIComponent(codigo)}`, { scroll: false });
  };

  const limpiarPersistencia = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/cliente');
      }
    } catch {
      // Ignorar
    }
    router.replace('/cliente', { scroll: false });
  };

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

  const cargarSillasActivas = async () => {
    const { data } = await supabase
      .from('sillas')
      .select('id, nombre_silla, nombre_barbero')
      .eq('activa', true)
      .order('creado_en', { ascending: true });

    if (data) {
      const lista = data as SillaActiva[];
      setSillasActivas(lista);
      setBarberoPreferido((prev) => {
        if (!prev) return '';
        const sigueActivo = lista.some(
          (s) => `${s.nombre_barbero} (${s.nombre_silla})` === prev
        );
        return sigueActivo ? prev : '';
      });
    }
  };

  useEffect(() => {
    const mananaInit = getMananaLocal();
    setFechaCita((prev) => prev || mananaInit);

    const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const mesesNombres = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    const listaDias = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      listaDias.push({
        fecha: `${y}-${m}-${day}`,
        diaCorto: diasNombres[d.getDay()],
        numDia: day,
        mesCorto: mesesNombres[d.getMonth()],
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
    cargarSillasActivas();

    const channelSillas = supabase
      .channel('cliente_sillas_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sillas' }, () => {
        cargarSillasActivas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelSillas);
    };
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
          if (
            s.id === 'barba' ||
            (s.nombre.toLowerCase().includes('barba') && !s.nombre.includes('+'))
          ) {
            icono = '🪒';
          } else if (s.id === 'corte_barba' || s.nombre.includes('+')) {
            icono = '💈';
          }

          unicosMap.set(s.nombre.toLowerCase().trim(), {
            id: s.id,
            nombre: s.nombre,
            precio: Number(s.precio),
            icono,
            descripcion: s.descripcion || '',
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

    const { count: totalSillas } = await supabase
      .from('sillas')
      .select('*', { count: 'exact', head: true })
      .eq('activa', true);
    const capacidadPorHora = Math.max(1, totalSillas || 1);

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

    const conteoPorHora: Record<string, number> = {};
    citasOcupadas?.forEach((c) => {
      conteoPorHora[c.hora_inicio] = (conteoPorHora[c.hora_inicio] || 0) + 1;
    });

    if (bloques) {
      const libres = bloques
        .filter((b) => (conteoPorHora[b.hora_inicio] || 0) < capacidadPorHora)
        .map((b) => ({
          ...b,
          cuposRestantes: capacidadPorHora - (conteoPorHora[b.hora_inicio] || 0),
        }));

      setBloquesDisponibles(libres);
      setHoraCitaSeleccionada((prevHora) =>
        prevHora && (conteoPorHora[prevHora] || 0) >= capacidadPorHora ? '' : prevHora
      );
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'horarios_disponibles' },
        () => {
          cargarHorarios();
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sillas' }, () => {
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

  const cargarCitaGuardada = async (codigoCita: string) => {
    const { data, error } = await supabase
      .from('citas')
      .select('*')
      .eq('codigo_ticket', codigoCita.toUpperCase())
      .neq('estado', 'cancelada')
      .maybeSingle();

    if (!error && data) {
      if (data.estado === 'atendida') {
        await cargarTurnoYPosicion(data.codigo_ticket);
        return;
      }
      setCitaConfirmada(data as CitaCliente);
    } else {
      limpiarPersistencia();
    }
    setLoading(false);
  };

  const cargarTurnoYPosicion = async (codigoOId: string) => {
    let query = supabase.from('turnos').select('*');
    if (codigoOId.includes('-')) {
      query = query.eq('codigo_ticket', codigoOId.toUpperCase());
    } else {
      query = query.eq('id', codigoOId);
    }

    const { data: miTurno, error } = await query.maybeSingle();

    if (!error && miTurno && miTurno.estado !== 'cancelado') {
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
    } else if (!miTurno || miTurno.estado === 'cancelado') {
      limpiarPersistencia();
      setTurno(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (reseteando) {
      if (!ticketParam && !citaParam) {
        setReseteando(false);
      }
      return;
    }

    let guardado: { tipo: 'turno' | 'cita'; codigo: string } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) guardado = JSON.parse(raw);
    } catch {
      guardado = null;
    }

    const idTurno =
      ticketParam ||
      turno?.codigo_ticket ||
      (guardado?.tipo === 'turno' ? guardado.codigo : null);
    const idCita =
      citaParam ||
      citaConfirmada?.codigo_ticket ||
      (guardado?.tipo === 'cita' ? guardado.codigo : null);

    if (idTurno) {
      if (!ticketParam) {
        router.replace(`/cliente?ticket=${encodeURIComponent(idTurno)}`, { scroll: false });
      }
      cargarTurnoYPosicion(idTurno);
    } else if (idCita) {
      if (!citaParam) {
        router.replace(`/cliente?cita=${encodeURIComponent(idCita)}`, { scroll: false });
      }
      cargarCitaGuardada(idCita);
    } else {
      setLoading(false);
    }

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
  }, [ticketParam, citaParam, turno?.id, turno?.codigo_ticket, reseteando]);

  useEffect(() => {
    if (
      turno &&
      turno.estado === 'atendiendo' &&
      turno.modalidad_espera === 'diligencia' &&
      turno.llamado_en &&
      !turno.cliente_llego
    ) {
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
          barbero_preferido: barberoPreferido || null,
          estado: 'espera',
        },
      ])
      .select()
      .single();

    if (!error && data) {
      setTurno(data as TurnoCliente);
      guardarPersistencia('turno', data.codigo_ticket);
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
          barbero_preferido: barberoPreferido || null,
          estado: 'confirmada',
        },
      ])
      .select()
      .single();

    if (!error && data) {
      setCitaConfirmada(data as CitaCliente);
      guardarPersistencia('cita', data.codigo_ticket);
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
    await supabase
      .from('turnos')
      .update({ cliente_llego: true, modalidad_espera: 'local' })
      .eq('id', turno.id);
  };

  const volverAlInicio = () => {
    setReseteando(true);
    limpiarPersistencia();
    setTurno(null);
    setCitaConfirmada(null);
    setNombre('');
    setTelefono('');
    setHoraCitaSeleccionada('');
    setBarberoPreferido('');
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

  const subCardClass = isDark
    ? 'bg-slate-900/90 border-slate-800 text-slate-100'
    : 'bg-slate-50 border-slate-200 text-slate-900';

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <div className="w-9 h-9 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-base font-bold text-slate-400">Cargando tu turno...</p>
      </div>
    );
  }

  // --- CITA CONFIRMADA ---
  if (citaConfirmada) {
    return (
      <div className="pt-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#2563EB]/15 border border-[#2563EB]/50 text-white flex items-center justify-center text-3xl mx-auto">
          📅
        </div>
        <div>
          <span className="inline-block px-3.5 py-1 rounded-full bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30 text-sm font-extrabold uppercase tracking-wider">
            Cita Confirmada
          </span>
          <h2 className="text-4xl font-black text-[#DC2626] mt-2">
            {citaConfirmada.codigo_ticket}
          </h2>
          <p className="text-lg font-bold mt-1">{citaConfirmada.nombre_cliente}</p>
        </div>

        <div className={`p-4 rounded-2xl border text-base space-y-2.5 text-left ${subCardClass}`}>
          <div className="flex justify-between">
            <span className="text-slate-400">Fecha:</span>
            <span className="font-bold">{citaConfirmada.fecha}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Hora:</span>
            <span className="font-black text-[#2563EB]">
              {citaConfirmada.hora_inicio.substring(0, 5)} hrs
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Servicio:</span>
            <span className="font-extrabold">
              {citaConfirmada.tipo_corte} ({APP_CONFIG.monedaSimbolo}
              {citaConfirmada.monto})
            </span>
          </div>
          {citaConfirmada.barbero_preferido && (
            <div className="flex justify-between">
              <span className="text-slate-400">Barbero:</span>
              <span className="font-black text-[#2563EB]">
                💈 {citaConfirmada.barbero_preferido}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={volverAlInicio}
          className="w-full py-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base uppercase tracking-wider shadow-md active:scale-95"
        >
          Volver al Inicio
        </button>
      </div>
    );
  }

  // --- MONITOR DE TURNO ACTIVO EN COLA ---
  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = Math.ceil(
      (personasAdelante * APP_CONFIG.tiempoEstimadoPorClienteMin) / sillasActivasCount
    );
    const porcentajeProgreso =
      turno.estado === 'atendiendo' || turno.estado === 'finalizado'
        ? 100
        : Math.min(
            100,
            Math.max(
              12,
              Math.round(((totalInicialCola - personasAdelante) / totalInicialCola) * 100)
            )
          );

    return (
      <div className="pt-4 space-y-5">
        <div className={`flex items-center justify-between p-4 rounded-2xl border ${subCardClass}`}>
          <div className="flex items-center gap-3.5">
            <div className="px-4 py-3 rounded-xl bg-[#DC2626] text-white text-xl font-black shrink-0">
              {turno.codigo_ticket}
            </div>
            <div>
              <span className="text-sm font-bold text-slate-400 block">
                Tu Turno · {horaActual}
              </span>
              <h2 className="text-xl font-black leading-tight mt-0.5">{turno.nombre_cliente}</h2>
              <p className="text-sm font-semibold text-slate-400 mt-0.5">
                {turno.tipo_corte} · {APP_CONFIG.monedaSimbolo}
                {turno.monto}
              </p>
              {turno.barbero_preferido && (
                <p className="text-sm font-black text-[#2563EB] mt-1">
                  💈 Preferencia: {turno.barbero_preferido}
                </p>
              )}
            </div>
          </div>
        </div>

        {turno.estado === 'espera' && (
          <>
            <div className={`p-4 rounded-2xl border space-y-2.5 ${subCardClass}`}>
              <div className="flex justify-between text-base font-extrabold">
                <span>Progreso de fila</span>
                <span className="text-[#2563EB]">{porcentajeProgreso}%</span>
              </div>
              <div
                className={`w-full h-3.5 rounded-full overflow-hidden ${
                  isDark ? 'bg-slate-800' : 'bg-slate-200'
                }`}
              >
                <div
                  className="h-full bg-[#2563EB] rounded-full transition-all duration-700"
                  style={{ width: `${porcentajeProgreso}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-2xl border text-center ${subCardClass}`}>
                <span className="text-sm font-bold text-slate-400 uppercase block">
                  Delante de ti
                </span>
                <p className="text-4xl font-black text-[#DC2626] mt-1.5">{personasAdelante}</p>
                <span className="text-sm font-semibold text-slate-400 mt-1 block">clientes</span>
              </div>
              <div className={`p-4 rounded-2xl border text-center ${subCardClass}`}>
                <span className="text-sm font-bold text-slate-400 uppercase block">
                  Espera aprox.
                </span>
                <p className="text-4xl font-black text-[#2563EB] mt-1.5">{tiempoEstimado}m</p>
                <span className="text-sm font-semibold text-slate-400 mt-1 block">
                  {sillasActivasCount > 1 ? `${sillasActivasCount} sillas activas` : 'estimados'}
                </span>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border space-y-3.5 ${subCardClass}`}>
              <div className="flex items-center justify-between text-base">
                <span className="font-bold text-slate-400">Modalidad:</span>
                <span
                  className={`px-3.5 py-1.5 rounded-lg font-extrabold text-sm border ${
                    isDark
                      ? 'bg-slate-800 text-white border-slate-700'
                      : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  {turno.modalidad_espera === 'diligencia' ? '🏃‍♂️ Diligencia' : '💈 En el local'}
                </span>
              </div>

              {turno.modalidad_espera === 'local' ? (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className="w-full py-3.5 rounded-xl border-2 border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB] hover:text-white font-extrabold text-base transition-all"
                >
                  Salgo a diligencia ({APP_CONFIG.tiempoLimiteDiligenciaMin} min tolerancia)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className="w-full py-3.5 rounded-xl bg-[#2563EB] text-white font-extrabold text-base"
                >
                  Ya regresé a la barbería
                </button>
              )}

              {distanciaKm !== null && turno.modalidad_espera === 'diligencia' && (
                <p className="text-sm text-center text-slate-400">
                  📍 Distancia al local: <strong>~{distanciaKm} km</strong>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={cancelarTurno}
              className="w-full py-4 rounded-xl border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-extrabold text-base transition-all"
            >
              Cancelar mi turno
            </button>
          </>
        )}

        {turno.estado === 'atendiendo' && (
          <div className={`p-6 rounded-2xl border-2 border-[#DC2626] text-center space-y-4 ${subCardClass}`}>
            {turno.nombre_barbero && (
              <span className="inline-block px-4 py-1.5 rounded-full bg-[#2563EB] text-white text-sm font-black uppercase tracking-wider">
                💺 {turno.nombre_barbero}
              </span>
            )}

            {turno.cliente_llego ? (
              <>
                <span className="text-5xl block">💈</span>
                <h2 className="text-2xl font-black text-[#DC2626]">¡Ya estás reportado!</h2>
                <p className="text-base font-semibold">El barbero sabe que estás listo en el local.</p>
              </>
            ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <>
                <span className="text-5xl block">🏃‍♂️</span>
                <h2 className="text-xl font-black text-[#DC2626]">¡El barbero te está llamando!</h2>
                <div className="py-3 px-5 rounded-xl bg-slate-950 border border-slate-800 text-white">
                  <span className="text-sm uppercase font-bold text-slate-400 block">
                    Tiempo para llegar
                  </span>
                  <p className="text-4xl font-black font-mono mt-1 text-[#2563EB]">
                    {formatearTiempo(tiempoRestanteSegundos)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={notificarLlegadaPresencial}
                  className="w-full py-4 rounded-xl bg-[#DC2626] text-white font-black text-base uppercase tracking-wider shadow-md active:scale-95"
                >
                  📍 ¡Ya llegué al local!
                </button>
              </>
            ) : (
              <>
                <span className="text-5xl block">✂️</span>
                <h2 className="text-2xl font-black text-[#DC2626]">¡Es tu turno!</h2>
                <p className="text-base font-semibold">
                  {turno.nombre_barbero
                    ? `Pasa adelante a ${turno.nombre_barbero}.`
                    : 'Pasa adelante, tu silla está lista.'}
                </p>
              </>
            )}
          </div>
        )}

        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className={`p-6 rounded-2xl border text-center space-y-4 ${subCardClass}`}>
            <span className="text-4xl block">{turno.estado === 'finalizado' ? '✨' : '⏳'}</span>
            <h2 className="text-xl font-black">
              {turno.estado === 'finalizado' ? '¡Gracias por tu visita!' : 'Tiempo agotado'}
            </h2>
            <button
              type="button"
              onClick={volverAlInicio}
              className="w-full py-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base uppercase tracking-wider active:scale-95"
            >
              Solicitar nuevo turno
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- FORMULARIO AZUL, BLANCO Y ROJO ---
  return (
    <div className="pt-4 space-y-5">
      <div className="text-center">
        <h2 className="text-2xl font-black tracking-tight">
          {nombre.trim() ? `Hola, ${nombre.trim().split(' ')[0]}` : 'Bienvenido'}
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Elige si vienes hoy o deseas agendar una cita
        </p>
      </div>

      {/* Selector Cola Hoy (Rojo) / Agendar Cita (Azul) */}
      <div
        className={`grid grid-cols-2 gap-1.5 p-1.5 rounded-xl border ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setModoRegistro('cola')}
          className={`py-2.5 rounded-lg text-sm font-black transition-all ${
            modoRegistro === 'cola'
              ? 'bg-[#DC2626] text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          ✂️ Turno Hoy
        </button>
        <button
          type="button"
          onClick={() => setModoRegistro('cita')}
          className={`py-2.5 rounded-lg text-sm font-black transition-all ${
            modoRegistro === 'cita'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📅 Agendar Cita
        </button>
      </div>

      {/* Barberos activos del turno */}
      {sillasActivas.length > 0 && (
        <div className={`p-3.5 rounded-xl border space-y-2.5 ${subCardClass}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              💈 Barberos de turno ({sillasActivas.length})
            </span>
            <span className="text-xs font-bold text-[#2563EB]">
              {barberoPreferido ? 'Elegido' : 'Toca para elegir'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBarberoPreferido('')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-black border transition-all ${
                barberoPreferido === ''
                  ? 'bg-[#2563EB] border-[#2563EB] text-white'
                  : isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-300'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              ⚡ Cualquiera
            </button>

            {sillasActivas.map((s) => {
              const etiqueta = `${s.nombre_barbero} (${s.nombre_silla})`;
              const isSelected = barberoPreferido === etiqueta;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setBarberoPreferido(etiqueta)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-black border transition-all ${
                    isSelected
                      ? 'bg-[#2563EB] border-[#2563EB] text-white'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-[#2563EB]/50'
                      : 'bg-white border-slate-300 text-slate-800 hover:border-[#2563EB]/50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{s.nombre_barbero}</span>
                  <span
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white/90' : 'text-[#2563EB]'
                    }`}
                  >
                    · {s.nombre_silla}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form
        onSubmit={modoRegistro === 'cola' ? unirmeALaCola : agendarCita}
        className="space-y-5"
      >
        <div>
          <label className="block text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-2">
            1. Selecciona tu servicio
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {listaServicios.map((srv) => {
              const selected = servicioSeleccionado.nombre === srv.nombre;
              return (
                <button
                  type="button"
                  key={srv.id}
                  onClick={() => setServicioSeleccionado(srv)}
                  className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                    selected
                      ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-md'
                      : isDark
                      ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-2xl mb-1">{srv.icono}</span>
                  <span className="text-sm font-extrabold leading-snug">{srv.nombre}</span>
                  <span
                    className={`text-base font-black mt-0.5 ${
                      selected ? 'text-white' : 'text-[#2563EB]'
                    }`}
                  >
                    {APP_CONFIG.monedaSimbolo}
                    {srv.precio}
                  </span>
                </button>
              );
            })}
          </div>

          {servicioSeleccionado?.descripcion && (
            <div
              className={`mt-2.5 p-3 rounded-xl border text-xs leading-relaxed flex items-start gap-2 ${
                isDark
                  ? 'bg-slate-950/90 border-[#2563EB]/40 text-slate-300'
                  : 'bg-blue-50/70 border-[#2563EB]/30 text-slate-700'
              }`}
            >
              <span className="text-sm shrink-0">ℹ️</span>
              <div>
                <span className="font-extrabold text-[#2563EB] block">
                  {servicioSeleccionado.nombre}:
                </span>
                <span>{servicioSeleccionado.descripcion}</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-extrabold uppercase tracking-wider text-slate-400">
            2. Tus datos de contacto
          </label>
          <input
            type="text"
            required
            placeholder="Tu nombre completo *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl border text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
          <input
            type="tel"
            required
            placeholder="WhatsApp (Ej: 04141234567) *"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={`w-full px-4 py-3 rounded-xl border text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
        </div>

        {modoRegistro === 'cola' && (
          <div>
            <label className="block text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-2">
              3. ¿Dónde esperarás tu turno?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModalidadEspera('local')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  modalidadEspera === 'local'
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : isDark
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <p className="text-base font-black">💈 En el Local</p>
                <p className="text-sm opacity-80 mt-0.5">Espero en barbería</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalidadEspera('diligencia');
                  obtenerUbicacionGPS();
                }}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  modalidadEspera === 'diligencia'
                    ? 'bg-[#2563EB] border-[#2563EB] text-white'
                    : isDark
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <p className="text-base font-black">🏃‍♂️ Diligencia</p>
                <p className="text-sm opacity-80 mt-0.5">
                  {APP_CONFIG.tiempoLimiteDiligenciaMin} min (GPS)
                </p>
              </button>
            </div>
          </div>
        )}

        {modoRegistro === 'cita' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-extrabold uppercase tracking-wider text-slate-400">
                  3. Elige el día
                </label>
                <span className="text-xs font-bold text-[#2563EB]">Desliza →</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1.5">
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
                      className={`min-w-[58px] py-2.5 px-2 rounded-xl border flex flex-col items-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-[#2563EB] border-[#2563EB] text-white font-black shadow-sm'
                          : isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <span className="text-[11px] font-bold">{d.diaCorto}</span>
                      <span className="text-base font-black leading-tight mt-0.5">{d.numDia}</span>
                      <span
                        className={`text-[10px] font-bold uppercase mt-0.5 ${
                          isSelected ? 'text-white/90' : 'text-slate-400'
                        }`}
                      >
                        {d.mesCorto}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                4. Elige la hora disponible
              </label>
              {bloquesDisponibles.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4 border border-dashed border-slate-700 rounded-xl">
                  Sin horarios disponibles para este día.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 max-h-36 overflow-y-auto pr-0.5">
                  {bloquesDisponibles.map((b) => {
                    const horaText = b.hora_inicio.substring(0, 5);
                    const selected = horaCitaSeleccionada === b.hora_inicio;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setHoraCitaSeleccionada(b.hora_inicio)}
                        className={`py-2.5 rounded-xl border text-base font-black transition-all flex flex-col items-center ${
                          selected
                            ? 'bg-[#DC2626] border-[#DC2626] text-white'
                            : isDark
                            ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-600'
                            : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-slate-400'
                        }`}
                      >
                        <span>{horaText}</span>
                        {sillasActivasCount > 1 && (
                          <span
                            className={`text-xs font-bold ${
                              selected ? 'text-white/90' : 'text-[#2563EB]'
                            }`}
                          >
                            {b.cuposRestantes} {b.cuposRestantes === 1 ? 'cupo' : 'cupos'}
                          </span>
                        )}
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
          disabled={
            registrando ||
            !nombre.trim() ||
            !telefono.trim() ||
            (modoRegistro === 'cita' && !horaCitaSeleccionada)
          }
          className="w-full py-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base tracking-wide shadow-lg transition-all active:scale-95 disabled:opacity-40"
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
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const [esNoche, setEsNoche] = useState<boolean>(false);

  const cambiarTema = (nuevoModo: 'auto' | 'light' | 'dark') => {
    setModoTema(nuevoModo);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nuevoModo);
    } catch {
      // Ignorar si localStorage está bloqueado
    }
  };

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(THEME_STORAGE_KEY) as 'auto' | 'light' | 'dark' | null;
      if (guardado === 'auto' || guardado === 'light' || guardado === 'dark') {
        setModoTema(guardado);
      }
    } catch {
      // Ignorar
    }

    const verificarHora = () => {
      const hora = new Date().getHours();
      setEsNoche(hora >= 19 || hora < 6);
    };

    verificarHora();
    const interval = setInterval(verificarHora, 60000);
    return () => clearInterval(interval);
  }, []);

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 ${
        isDark ? 'bg-[#080D1A] text-white' : 'bg-[#F1F5F9] text-slate-900'
      }`}
    >
      <div
        className={`w-full max-w-[440px] rounded-3xl p-3 sm:p-4 shadow-2xl border transition-colors ${
          isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="rounded-2xl border-2 border-[#2563EB]/60 p-5 sm:p-6">
          <div
            className={`flex items-center justify-between pb-3 border-b ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-extrabold transition-all active:scale-95 ${
                isDark
                  ? 'bg-slate-900 text-white border border-slate-800 hover:border-[#2563EB]'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              }`}
            >
              ← Inicio
            </Link>

            <div
              className={`flex items-center gap-1 p-1 rounded-full border text-sm font-bold ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                onClick={() => cambiarTema('light')}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'light' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400'
                }`}
              >
                ☀️
              </button>
              <button
                onClick={() => cambiarTema('dark')}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'dark' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-slate-400'
                }`}
              >
                🌙
              </button>
              <button
                onClick={() => cambiarTema('auto')}
                className={`px-3 h-8 rounded-full transition-all ${
                  modoTema === 'auto' ? 'bg-[#DC2626] text-white shadow-xs' : 'text-slate-400'
                }`}
              >
                Auto
              </button>
            </div>
          </div>

          <Suspense fallback={<p className="text-center text-base py-10">Cargando...</p>}>
            <ClienteContent isDark={isDark} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
