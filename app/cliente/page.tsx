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

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

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

const generarBloquesHoy = () => {
  const ahora = new Date();
  const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();
  const bloques: { valor: string; etiqueta: string }[] = [];

  for (let h = 9; h <= 20; h++) {
    const mins00 = h * 60;
    if (mins00 > minutosActuales) {
      const h12 = h > 12 ? h - 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      bloques.push({
        valor: `${String(h).padStart(2, '0')}:00`,
        etiqueta: `${h12}:00 ${ampm}`,
      });
    }

    if (h < 20) {
      const mins30 = h * 60 + 30;
      if (mins30 > minutosActuales) {
        const h12 = h > 12 ? h - 12 : h;
        const ampm = h >= 12 ? 'PM' : 'AM';
        bloques.push({
          valor: `${String(h).padStart(2, '0')}:30`,
          etiqueta: `${h12}:30 ${ampm}`,
        });
      }
    }
  }
  return bloques;
};

function ClienteContent({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');
  const citaParam = searchParams.get('cita');

  // Flujo por pasos (1: Servicio 2x2, 2: Barbero y Horario/Modalidad, 3: Tus Datos y Confirmar)
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

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
  const [horaLlegadaLocal, setHoraLlegadaLocal] = useState<string>('ahora');
  const [horasOcupadasHoy, setHorasOcupadasHoy] = useState<string[]>([]);

  const [registrando, setRegistrando] = useState(false);
  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [reseteando, setReseteando] = useState<boolean>(false);

  // Mensaje cuando el turno o cita expiró/fue cancelado por superar los 15 min
  const [avisoExpirado, setAvisoExpirado] = useState<string | null>(null);

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

  const registrarSuscripcionPushCliente = async (
    nombreCliente: string,
    telefonoCliente: string
  ) => {
    try {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) return;

      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      await fetch('/api/push-suscribir-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          cliente_telefono: telefonoCliente,
          nombre_cliente: nombreCliente,
        }),
      });
    } catch {
      // Ignorar si el navegador bloquea Push o no soporta SW
    }
  };

  const cargarHorasOcupadasHoy = async () => {
    const inicioDia = `${getHoyLocal()}T00:00:00`;
    const { data } = await supabase
      .from('turnos')
      .select('nombre_cliente')
      .in('estado', ['espera', 'atendiendo'])
      .gte('creado_en', inicioDia);

    if (data) {
      const ocupadas: string[] = [];
      data.forEach((t) => {
        const match = t.nombre_cliente?.match(/· 🕒 (.+)$/);
        if (match && match[1]) {
          ocupadas.push(match[1].trim());
        }
      });
      setHorasOcupadasHoy(ocupadas);
      setHoraLlegadaLocal((prev) =>
        prev !== 'ahora' && ocupadas.includes(prev) ? 'ahora' : prev
      );
    }
  };

  useEffect(() => {
    cargarHorasOcupadasHoy();

    const channelHorasHoy = supabase
      .channel('cliente_horas_ocupadas_hoy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarHorasOcupadasHoy();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelHorasHoy);
    };
  }, []);

  const bloquesHoy = generarBloquesHoy().filter(
    (b) => !horasOcupadasHoy.includes(b.etiqueta)
  );

  const guardarPersistencia = (tipo: 'turno' | 'cita', codigo: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tipo, codigo }));
    } catch {
      // Ignorar
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
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
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
          } else if (s.nombre.toLowerCase().includes('ozono') || s.nombre.toLowerCase().includes('vapor')) {
            icono = '💨';
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
      .maybeSingle();

    if (!error && data && data.estado !== 'cancelada') {
      if (data.estado === 'atendida') {
        await cargarTurnoYPosicion(data.codigo_ticket);
        return;
      }
      setCitaConfirmada(data as CitaCliente);
    } else {
      if (citaConfirmada && data?.estado === 'cancelada') {
        setAvisoExpirado(
          'Tu cita fue cancelada por superar los 15 minutos de tolerancia o por gestión de la barbería. Puedes volver a programar un nuevo horario.'
        );
      }
      limpiarPersistencia();
      setCitaConfirmada(null);
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
      if (turno && turno.estado !== 'cancelado') {
        setAvisoExpirado(
          'Tu turno fue cancelado por superar el límite máximo de 15 minutos o por ausencia. Debes volver a programar un nuevo turno.'
        );
      }
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

    const channelCitasActual = supabase
      .channel('cliente_realtime_cita_activa')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => {
        const actualCita = citaParam || citaConfirmada?.codigo_ticket;
        if (actualCita) cargarCitaGuardada(actualCita);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(channelCitasActual);
    };
  }, [ticketParam, citaParam, turno?.id, turno?.codigo_ticket, citaConfirmada?.codigo_ticket, reseteando]);

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
    setAvisoExpirado(null);

    const etiquetaHora =
      modalidadEspera === 'local'
        ? horaLlegadaLocal !== 'ahora'
          ? horaLlegadaLocal
          : ''
        : '';

    if (etiquetaHora) {
      const inicioDia = `${getHoyLocal()}T00:00:00`;
      const { data: yaExiste } = await supabase
        .from('turnos')
        .select('id')
        .in('estado', ['espera', 'atendiendo'])
        .gte('creado_en', inicioDia)
        .ilike('nombre_cliente', `%· 🕒 ${etiquetaHora}%`)
        .limit(1);

      if (yaExiste && yaExiste.length > 0) {
        alert(`Lo sentimos, la hora ${etiquetaHora} acaba de ser tomada por otro cliente. Elige otro horario.`);
        await cargarHorasOcupadasHoy();
        setRegistrando(false);
        return;
      }
    }

    const numero = Math.floor(Math.random() * 900) + 100;
    const codigo = `B-${numero}`;

    const nombreConHora = etiquetaHora
      ? `${nombre.trim()} · 🕒 ${etiquetaHora}`
      : nombre.trim();

    const { data, error } = await supabase
      .from('turnos')
      .insert([
        {
          codigo_ticket: codigo,
          nombre_cliente: nombreConHora,
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
      registrarSuscripcionPushCliente(nombre.trim(), telefono);

      fetch('/api/push-cita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'turno',
          codigo_ticket: data.codigo_ticket,
          nombre_cliente: data.nombre_cliente,
          tipo_corte: data.tipo_corte,
          modalidad_espera: data.modalidad_espera,
          barbero_preferido: data.barbero_preferido,
        }),
      }).catch(() => {});

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
    setAvisoExpirado(null);

    // Validación en tiempo real de disponibilidad de cupo antes de insertar
    const { count: totalSillas } = await supabase
      .from('sillas')
      .select('*', { count: 'exact', head: true })
      .eq('activa', true);
    const capacidadPorHora = Math.max(1, totalSillas || 1);

    const { count: ocupadasAhora } = await supabase
      .from('citas')
      .select('*', { count: 'exact', head: true })
      .eq('fecha', fechaCita)
      .eq('hora_inicio', horaCitaSeleccionada)
      .neq('estado', 'cancelada');

    if ((ocupadasAhora || 0) >= capacidadPorHora) {
      alert('Ese bloque horario acaba de ocuparse. Por favor elige otra hora disponible.');
      await cargarHorarios();
      setRegistrando(false);
      return;
    }

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
      registrarSuscripcionPushCliente(nombre.trim(), telefono);

      fetch('/api/push-cita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'cita',
          codigo_ticket: data.codigo_ticket,
          nombre_cliente: data.nombre_cliente,
          tipo_corte: data.tipo_corte,
          fecha: data.fecha,
          hora_inicio: data.hora_inicio,
          barbero_preferido: data.barbero_preferido,
        }),
      }).catch(() => {});

      setCitaConfirmada(data as CitaCliente);
      guardarPersistencia('cita', data.codigo_ticket);
      cargarHorarios();
    }
    setRegistrando(false);
  };

  const cancelarCita = async () => {
    if (!citaConfirmada) return;
    const confirmar = confirm('¿Seguro que deseas cancelar tu cita agendada?');
    if (!confirmar) return;

    const citaCancelada = { ...citaConfirmada };

    const { error } = await supabase
      .from('citas')
      .update({ estado: 'cancelada' })
      .eq('id', citaCancelada.id);

    if (!error) {
      try {
        await fetch('/api/push-cita', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            tipo: 'cancelacion',
            codigo_ticket: citaCancelada.codigo_ticket,
            nombre_cliente: citaCancelada.nombre_cliente,
            tipo_corte: citaCancelada.tipo_corte,
            fecha: citaCancelada.fecha,
            hora_inicio: citaCancelada.hora_inicio,
            barbero_preferido: citaCancelada.barbero_preferido,
          }),
        });
      } catch (err) {
        console.error('Error enviando push de cancelación de cita:', err);
      }
    }

    volverAlInicio();
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
    setHoraLlegadaLocal('ahora');
    setPaso(1);
  };

  const cancelarTurno = async () => {
    if (!turno) return;
    const confirmar = confirm('¿Seguro que deseas cancelar tu turno en la cola?');
    if (!confirmar) return;

    const turnoCancelado = { ...turno };

    const { error } = await supabase
      .from('turnos')
      .update({ estado: 'cancelado' })
      .eq('id', turnoCancelado.id);

    if (!error) {
      try {
        await fetch('/api/push-cita', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            tipo: 'cancelacion',
            codigo_ticket: turnoCancelado.codigo_ticket,
            nombre_cliente: turnoCancelado.nombre_cliente,
            tipo_corte: turnoCancelado.tipo_corte,
            barbero_preferido: turnoCancelado.barbero_preferido,
          }),
        });
      } catch (err) {
        console.error('Error enviando push de cancelación:', err);
      }
    }

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
      <div className="pt-3 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-[#2563EB]/15 border-2 border-[#2563EB] text-white flex items-center justify-center text-3xl mx-auto">
          📅
        </div>
        <div>
          <span className="inline-block px-3.5 py-1 rounded-full bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30 text-xs font-extrabold uppercase tracking-wider">
            Cita Confirmada
          </span>
          <h2 className="text-4xl font-black text-[#DC2626] mt-1.5">
            {citaConfirmada.codigo_ticket}
          </h2>
          <p className="text-lg font-bold mt-0.5 break-words">{citaConfirmada.nombre_cliente}</p>
        </div>

        <div className={`p-4 rounded-2xl border text-sm space-y-2 text-left ${subCardClass}`}>
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
          <div className="flex justify-between gap-2">
            <span className="text-slate-400 shrink-0">Servicio:</span>
            <span className="font-extrabold text-right">
              {citaConfirmada.tipo_corte} ({APP_CONFIG.monedaSimbolo}
              {citaConfirmada.monto})
            </span>
          </div>
          {citaConfirmada.barbero_preferido && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">Barbero:</span>
              <span className="font-black text-[#2563EB] text-right">
                💈 {citaConfirmada.barbero_preferido}
              </span>
            </div>
          )}
        </div>

        {/* Aviso de puntualidad y tolerancia máxima de 15 minutos */}
        <div
          className={`p-3 rounded-2xl border text-xs text-left leading-snug ${
            isDark
              ? 'bg-amber-950/30 border-amber-700/40 text-amber-300'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}
        >
          ⏰ <strong>Tolerancia máxima de 15 min:</strong> Preséntate puntual. Si no llegas dentro de los 15 minutos posteriores a tu hora, la cita se cancela automáticamente y deberás volver a programar.
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={volverAlInicio}
            className="w-full py-3.5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-base uppercase tracking-wider shadow-md active:scale-95"
          >
            Volver al Inicio
          </button>

          <button
            type="button"
            onClick={cancelarCita}
            className="w-full py-3 rounded-2xl border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-extrabold text-sm transition-all"
          >
            Cancelar mi cita
          </button>
        </div>
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
      <div className="pt-3 space-y-4">
        <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${subCardClass}`}>
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2.5 rounded-2xl bg-[#DC2626] text-white text-lg font-black shrink-0">
              {turno.codigo_ticket}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-400 block">
                Tu Turno · {horaActual}
              </span>
              <h2 className="text-lg font-black leading-snug break-words">{turno.nombre_cliente}</h2>
              <p className="text-xs font-semibold text-slate-400">
                {turno.tipo_corte} · {APP_CONFIG.monedaSimbolo}
                {turno.monto}
              </p>
              {turno.barbero_preferido && (
                <p className="text-xs font-black text-[#2563EB] mt-0.5">
                  💈 {turno.barbero_preferido}
                </p>
              )}
            </div>
          </div>
        </div>

        {turno.estado === 'espera' && (
          <>
            <div className={`p-3.5 rounded-2xl border space-y-2 ${subCardClass}`}>
              <div className="flex justify-between text-sm font-extrabold">
                <span>Progreso de fila</span>
                <span className="text-[#2563EB]">{porcentajeProgreso}%</span>
              </div>
              <div
                className={`w-full h-3 rounded-full overflow-hidden ${
                  isDark ? 'bg-slate-800' : 'bg-slate-200'
                }`}
              >
                <div
                  className="h-full bg-[#2563EB] rounded-full transition-all duration-700"
                  style={{ width: `${porcentajeProgreso}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className={`p-3.5 rounded-2xl border text-center ${subCardClass}`}>
                <span className="text-xs font-bold text-slate-400 uppercase block">
                  Delante de ti
                </span>
                <p className="text-3xl font-black text-[#DC2626] mt-1">{personasAdelante}</p>
                <span className="text-xs font-semibold text-slate-400 block">clientes</span>
              </div>
              <div className={`p-3.5 rounded-2xl border text-center ${subCardClass}`}>
                <span className="text-xs font-bold text-slate-400 uppercase block">
                  Espera aprox.
                </span>
                <p className="text-3xl font-black text-[#2563EB] mt-1">{tiempoEstimado}m</p>
                <span className="text-xs font-semibold text-slate-400 block">
                  {sillasActivasCount > 1 ? `${sillasActivasCount} sillas` : 'estimados'}
                </span>
              </div>
            </div>

            <div className={`p-3.5 rounded-2xl border space-y-2.5 ${subCardClass}`}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-400">Modalidad:</span>
                <span
                  className={`px-3 py-1 rounded-lg font-extrabold text-xs border ${
                    isDark
                      ? 'bg-slate-800 text-white border-slate-700'
                      : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  {turno.modalidad_espera === 'diligencia' ? '🏃♂️ Diligencia' : '💈 En el local'}
                </span>
              </div>

              {turno.modalidad_espera === 'local' ? (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('diligencia')}
                  className="w-full py-3 rounded-xl border-2 border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB] hover:text-white font-extrabold text-sm transition-all"
                >
                  Salgo a diligencia (15 min tolerancia máx.)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cambiarModalidadEnVivo('local')}
                  className="w-full py-3 rounded-xl bg-[#2563EB] text-white font-extrabold text-sm"
                >
                  Ya regresé a la barbería
                </button>
              )}

              {distanciaKm !== null && turno.modalidad_espera === 'diligencia' && (
                <p className="text-xs text-center text-slate-400">
                  📍 Distancia al local: <strong>~{distanciaKm} km</strong>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={cancelarTurno}
              className="w-full py-3.5 rounded-2xl border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-extrabold text-sm transition-all"
            >
              Cancelar mi turno
            </button>
          </>
        )}

        {turno.estado === 'atendiendo' && (
          <div className={`p-5 rounded-2xl border-2 border-[#DC2626] text-center space-y-3.5 ${subCardClass}`}>
            {turno.nombre_barbero && (
              <span className="inline-block px-4 py-1.5 rounded-full bg-[#2563EB] text-white text-xs font-black uppercase tracking-wider">
                💺 {turno.nombre_barbero}
              </span>
            )}

            {turno.cliente_llego ? (
              <>
                <span className="text-5xl block">💈</span>
                <h2 className="text-2xl font-black text-[#DC2626]">¡Ya estás reportado!</h2>
                <p className="text-sm font-semibold">El barbero sabe que estás listo en el local.</p>
              </>
            ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <>
                <span className="text-5xl block">🏃♂️</span>
                <h2 className="text-xl font-black text-[#DC2626]">¡El barbero te está llamando!</h2>
                <div className="py-2.5 px-5 rounded-xl bg-slate-950 border border-slate-800 text-white">
                  <span className="text-xs uppercase font-bold text-slate-400 block">
                    Tiempo para llegar
                  </span>
                  <p className="text-4xl font-black font-mono mt-0.5 text-[#2563EB]">
                    {formatearTiempo(tiempoRestanteSegundos)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={notificarLlegadaPresencial}
                  className="w-full py-3.5 rounded-2xl bg-[#DC2626] text-white font-black text-base uppercase tracking-wider shadow-md active:scale-95"
                >
                  📍 ¡Ya llegué al local!
                </button>
              </>
            ) : (
              <>
                <span className="text-5xl block">✂️</span>
                <h2 className="text-2xl font-black text-[#DC2626]">¡Es tu turno!</h2>
                <p className="text-sm font-semibold">
                  {turno.nombre_barbero
                    ? `Pasa adelante a ${turno.nombre_barbero}.`
                    : 'Pasa adelante, tu silla está lista.'}
                </p>
              </>
            )}
          </div>
        )}

        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className={`p-5 rounded-2xl border text-center space-y-3.5 ${subCardClass}`}>
            <span className="text-4xl block">{turno.estado === 'finalizado' ? '✨' : '🚫'}</span>
            <h2 className="text-xl font-black">
              {turno.estado === 'finalizado'
                ? '¡Gracias por tu visita!'
                : 'Turno cancelado por ausencia'}
            </h2>
            {turno.estado === 'ausente' && (
              <p className="text-xs font-semibold text-slate-400 leading-snug">
                Superaste el límite máximo de 15 minutos sin presentarte. Debes volver a programar un nuevo turno.
              </p>
            )}
            <button
              type="button"
              onClick={volverAlInicio}
              className="w-full py-3.5 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base uppercase tracking-wider active:scale-95"
            >
              Volver a programar
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- PANTALLA PROTAGONISTA DE TURNO / CITA CANCELADA ---
  if (avisoExpirado) {
    return (
      <div className="pt-4">
        <div
          className={`p-6 rounded-3xl border-2 border-[#DC2626] text-center space-y-4 shadow-lg ${
            isDark
              ? 'bg-[#DC2626]/15 text-red-100'
              : 'bg-red-50 text-red-950'
          }`}
        >
          <div className="w-20 h-20 rounded-full bg-[#DC2626] text-white flex items-center justify-center text-4xl mx-auto shadow-md">
            ⏰
          </div>

          <div className="space-y-1.5">
            <span className="inline-block px-3.5 py-1 rounded-full bg-[#DC2626] text-white text-xs font-black uppercase tracking-wider">
              Turno Cancelado
            </span>
            <h2 className="text-2xl font-black text-[#DC2626] leading-tight pt-1">
              ¡Tu turno ha sido cancelado!
            </h2>
          </div>

          <p className="text-base font-bold leading-relaxed">
            {avisoExpirado}
          </p>

          <button
            type="button"
            onClick={() => setAvisoExpirado(null)}
            className="w-full py-4 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base uppercase tracking-wider shadow-md transition-all active:scale-95"
          >
            Volver a programar turno
          </button>
        </div>
      </div>
    );
  }

  // --- FORMULARIO POR PASOS (SIN SCROLL VERTICAL + ICONOS PROTAGONISTAS 2x2) ---
  return (
    <div className="pt-3 space-y-4">
      {/* Indicador de 3 pasos */}
      <div className="flex items-center justify-between gap-2">
        {[
          { num: 1, label: 'Servicio' },
          { num: 2, label: 'Horario' },
          { num: 3, label: 'Confirmar' },
        ].map((st) => {
          const activo = paso === st.num;
          const completado = paso > st.num;
          return (
            <button
              key={st.num}
              type="button"
              onClick={() => {
                if (st.num < paso) setPaso(st.num as 1 | 2 | 3);
              }}
              className={`flex-1 py-2 px-2 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                activo
                  ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-sm'
                  : completado
                  ? isDark
                    ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-500'
                  : 'bg-slate-100 border-slate-200 text-slate-400'
              }`}
            >
              <span>{completado ? '✓' : st.num}</span>
              <span>{st.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= PASO 1: MODALIDAD + SERVICIOS EN CUADRÍCULA 2x2 CIRCULAR ================= */}
      {paso === 1 && (
        <div className="space-y-4">
          {/* Selector Cola Hoy / Agendar Cita */}
          <div
            className={`grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl border ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setModoRegistro('cola')}
              className={`py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all ${
                modoRegistro === 'cola'
                  ? 'bg-[#DC2626] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-lg leading-none">✂️</span>
              <span>Turno Hoy</span>
            </button>
            <button
              type="button"
              onClick={() => setModoRegistro('cita')}
              className={`py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-1.5 transition-all ${
                modoRegistro === 'cita'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-lg leading-none">📅</span>
              <span>Agendar Cita</span>
            </button>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-black tracking-tight uppercase">
              Elige tu Servicio
            </h2>
          </div>

          {/* Cuadrícula 2x2 con círculos grandes */}
          <div className="grid grid-cols-2 gap-3">
            {listaServicios.map((srv) => {
              const selected = servicioSeleccionado.nombre === srv.nombre;
              return (
                <button
                  type="button"
                  key={srv.id}
                  onClick={() => setServicioSeleccionado(srv)}
                  className={`p-3.5 rounded-3xl border-2 flex flex-col items-center justify-center text-center transition-all active:scale-95 ${
                    selected
                      ? 'bg-[#2563EB]/15 border-[#2563EB] shadow-md'
                      : isDark
                      ? 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-16 h-16 rounded-full border-[3px] flex items-center justify-center text-3xl mb-2 transition-all ${
                      selected
                        ? 'bg-[#2563EB] border-[#DC2626] text-white scale-105 shadow-md'
                        : isDark
                        ? 'bg-slate-900 border-slate-700 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    {srv.icono}
                  </div>

                  <span className="text-sm font-black leading-snug break-words">
                    {srv.nombre}
                  </span>

                  <span
                    className={`mt-1 px-2.5 py-0.5 rounded-full text-xs font-black ${
                      selected
                        ? 'bg-[#DC2626] text-white'
                        : 'bg-[#2563EB]/15 text-[#2563EB]'
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
              className={`p-2.5 rounded-2xl border text-xs leading-snug flex items-start gap-2 ${
                isDark
                  ? 'bg-slate-950/90 border-[#2563EB]/40 text-slate-300'
                  : 'bg-blue-50/70 border-[#2563EB]/30 text-slate-700'
              }`}
            >
              <span className="text-base shrink-0">ℹ️</span>
              <span>{servicioSeleccionado.descripcion}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setPaso(2)}
            className="w-full py-4 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base tracking-wide shadow-lg transition-all active:scale-95"
          >
            Continuar →
          </button>
        </div>
      )}

      {/* ================= PASO 2: BARBERO (CIRCULAR) + HORARIO EN TIRA HORIZONTAL ================= */}
      {paso === 2 && (
        <div className="space-y-4">
          {sillasActivas.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  💈 Elige Barbero
                </span>
                <span className="text-xs font-bold text-[#2563EB]">Desliza →</span>
              </div>

              <div className="flex gap-2.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setBarberoPreferido('')}
                  className={`min-w-[96px] p-2.5 rounded-2xl border-2 flex flex-col items-center text-center shrink-0 transition-all ${
                    barberoPreferido === ''
                      ? 'bg-[#2563EB]/15 border-[#2563EB]'
                      : isDark
                      ? 'bg-slate-950 border-slate-800'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-2xl mb-1 ${
                      barberoPreferido === ''
                        ? 'bg-[#2563EB] border-[#DC2626] text-white'
                        : isDark
                        ? 'bg-slate-900 border-slate-700'
                        : 'bg-white border-slate-300'
                    }`}
                  >
                    ⚡
                  </div>
                  <span className="text-xs font-black leading-tight">Cualquiera</span>
                  <span className="text-[10px] font-bold text-[#2563EB]">Más rápido</span>
                </button>

                {sillasActivas.map((s) => {
                  const etiqueta = `${s.nombre_barbero} (${s.nombre_silla})`;
                  const isSelected = barberoPreferido === etiqueta;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setBarberoPreferido(etiqueta)}
                      className={`min-w-[104px] p-2.5 rounded-2xl border-2 flex flex-col items-center text-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-[#2563EB]/15 border-[#2563EB]'
                          : isDark
                          ? 'bg-slate-950 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div
                        className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-2xl mb-1 ${
                          isSelected
                            ? 'bg-[#2563EB] border-[#DC2626] text-white'
                            : isDark
                            ? 'bg-slate-900 border-slate-700'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        💈
                      </div>
                      <span className="text-xs font-black leading-tight break-words">
                        {s.nombre_barbero}
                      </span>
                      <span className="text-[10px] font-bold text-[#2563EB]">
                        {s.nombre_silla}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opciones para TURNO HOY */}
          {modoRegistro === 'cola' && (
            <div className="space-y-3">
              <span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1">
                ¿Dónde esperarás?
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalidadEspera('local')}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center text-center transition-all ${
                    modalidadEspera === 'local'
                      ? 'bg-[#2563EB] border-[#2563EB] text-white'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-2xl mb-0.5">💈</span>
                  <span className="text-sm font-black">En el Local</span>
                  <span className="text-[11px] opacity-80">Orden de llegada</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalidadEspera('diligencia');
                    setHoraLlegadaLocal('ahora');
                    obtenerUbicacionGPS();
                  }}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center text-center transition-all ${
                    modalidadEspera === 'diligencia'
                      ? 'bg-[#2563EB] border-[#2563EB] text-white'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="text-2xl mb-0.5">🏃‍♂️</span>
                  <span className="text-sm font-black">Diligencia</span>
                  <span className="text-[11px] opacity-80">15 min tolerancia máx.</span>
                </button>
              </div>

              {modalidadEspera === 'local' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-extrabold uppercase text-slate-400">
                      🕒 Llegada estimada hoy
                    </span>
                    <span className="text-xs font-bold text-[#2563EB]">Desliza →</span>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1.5">
                    <button
                      type="button"
                      onClick={() => setHoraLlegadaLocal('ahora')}
                      className={`px-3.5 py-2.5 rounded-xl border text-xs font-black shrink-0 transition-all ${
                        horaLlegadaLocal === 'ahora'
                          ? 'bg-[#DC2626] border-[#DC2626] text-white shadow-sm'
                          : isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-200'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      ⚡ Ya estoy aquí
                    </button>

                    {bloquesHoy.map((b) => {
                      const selected = horaLlegadaLocal === b.etiqueta;
                      return (
                        <button
                          key={b.valor}
                          type="button"
                          onClick={() => setHoraLlegadaLocal(b.etiqueta)}
                          className={`px-3.5 py-2.5 rounded-xl border text-xs font-black shrink-0 transition-all ${
                            selected
                              ? 'bg-[#DC2626] border-[#DC2626] text-white shadow-sm'
                              : isDark
                              ? 'bg-slate-950 border-slate-800 text-slate-200'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          {b.etiqueta}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Opciones para AGENDAR CITA (Tira horizontal días + Tira horizontal horas) */}
          {modoRegistro === 'cita' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-xs font-extrabold uppercase text-slate-400">
                    📅 Día de la cita
                  </span>
                  <span className="text-xs font-bold text-[#2563EB]">Desliza →</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
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
                        className={`min-w-[56px] py-2 px-2 rounded-2xl border flex flex-col items-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-[#DC2626] border-[#DC2626] text-white font-black shadow-sm'
                            : isDark
                            ? 'bg-slate-950 border-slate-800 text-slate-300'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase">{d.diaCorto}</span>
                        <span className="text-base font-black leading-tight">{d.numDia}</span>
                        <span className="text-[10px] font-bold opacity-80">{d.mesCorto}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-xs font-extrabold uppercase text-slate-400">
                    🕒 Hora disponible
                  </span>
                  <span className="text-xs font-bold text-[#2563EB]">Desliza →</span>
                </div>
                {bloquesDisponibles.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3 border border-dashed border-slate-700 rounded-xl">
                    Sin horarios disponibles para este día.
                  </p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1.5">
                    {bloquesDisponibles.map((b) => {
                      const horaText = b.hora_inicio.substring(0, 5);
                      const selected = horaCitaSeleccionada === b.hora_inicio;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setHoraCitaSeleccionada(b.hora_inicio)}
                          className={`min-w-[78px] py-2.5 px-3 rounded-2xl border text-sm font-black shrink-0 flex flex-col items-center transition-all ${
                            selected
                              ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-sm'
                              : isDark
                              ? 'bg-slate-950 border-slate-800 text-slate-200'
                              : 'bg-slate-50 border-slate-200 text-slate-900'
                          }`}
                        >
                          <span>{horaText}</span>
                          {sillasActivasCount > 1 && (
                            <span
                              className={`text-[10px] font-bold ${
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

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPaso(1)}
              className={`px-4 py-3.5 rounded-2xl border text-sm font-black ${
                isDark
                  ? 'border-slate-800 text-slate-300'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              ← Atrás
            </button>
            <button
              type="button"
              onClick={() => setPaso(3)}
              disabled={modoRegistro === 'cita' && !horaCitaSeleccionada}
              className="flex-1 py-3.5 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base shadow-md active:scale-95 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ================= PASO 3: DATOS Y RESUMEN FINAL ================= */}
      {paso === 3 && (
        <form
          onSubmit={modoRegistro === 'cola' ? unirmeALaCola : agendarCita}
          className="space-y-4"
        >
          <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 ${subCardClass}`}>
            <div className="flex items-center gap-2.5">
              <span className="w-11 h-11 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-2xl shrink-0">
                {servicioSeleccionado.icono}
              </span>
              <div>
                <p className="text-sm font-black leading-snug">{servicioSeleccionado.nombre}</p>
                <p className="text-xs font-bold text-slate-400">
                  {modoRegistro === 'cola'
                    ? horaLlegadaLocal === 'ahora'
                      ? 'Turno hoy · Orden de llegada'
                      : `Turno hoy · Llegada ~${horaLlegadaLocal}`
                    : `Cita puntual · ${fechaCita} (${horaCitaSeleccionada.substring(0, 5)})`}
                </p>
              </div>
            </div>
            <span className="text-lg font-black text-[#2563EB] shrink-0">
              {APP_CONFIG.monedaSimbolo}
              {servicioSeleccionado.precio}
            </span>
          </div>

          <div className="space-y-2.5">
            <input
              type="text"
              required
              placeholder="Tu nombre completo *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={`w-full px-4 py-3.5 rounded-2xl border text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
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
              className={`w-full px-4 py-3.5 rounded-2xl border text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPaso(2)}
              className={`px-4 py-4 rounded-2xl border text-sm font-black ${
                isDark
                  ? 'border-slate-800 text-slate-300'
                  : 'border-slate-300 text-slate-700'
              }`}
            >
              ← Atrás
            </button>
            <button
              type="submit"
              disabled={registrando || !nombre.trim() || !telefono.trim()}
              className="flex-1 py-4 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base tracking-wide shadow-lg transition-all active:scale-95 disabled:opacity-40"
            >
              {registrando
                ? 'Procesando...'
                : modoRegistro === 'cola'
                ? 'Confirmar Turno'
                : 'Confirmar Cita'}
            </button>
          </div>
        </form>
      )}
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
      // Ignorar
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
      className={`min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-5 transition-colors duration-300 ${
        isDark ? 'bg-[#080D1A] text-white' : 'bg-[#F1F5F9] text-slate-900'
      }`}
    >
      <div
        className={`w-full max-w-[430px] rounded-3xl p-2.5 sm:p-3.5 shadow-2xl border transition-colors ${
          isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="rounded-2xl border-2 border-[#2563EB]/60 p-4 sm:p-5">
          <div
            className={`flex items-center justify-between pb-3 border-b ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all active:scale-95 ${
                isDark
                  ? 'bg-slate-900 text-white border border-slate-800 hover:border-[#2563EB]'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              }`}
            >
              ← Inicio
            </Link>

            <div
              className={`flex items-center gap-1 p-1 rounded-full border text-xs font-bold ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                onClick={() => cambiarTema('light')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'light' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400'
                }`}
              >
                ☀️
              </button>
              <button
                onClick={() => cambiarTema('dark')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'dark' ? 'bg-[#2563EB] text-white shadow-xs' : 'text-slate-400'
                }`}
              >
                🌙
              </button>
              <button
                onClick={() => cambiarTema('auto')}
                className={`px-2.5 h-7 rounded-full transition-all ${
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
