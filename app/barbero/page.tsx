'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { APP_CONFIG } from '../../lib/config';

interface Turno {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono?: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  llamado_en?: string;
  finalizado_en?: string;
  cliente_llego?: boolean;
  creado_en: string;
}

interface Cita {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono?: string;
  tipo_corte: string;
  monto: number;
  fecha: string;
  hora_inicio: string;
  estado: string;
}

const SERVICIOS_DEFAULT = [
  { nombre: 'Corte clásico', precio: 10 },
  { nombre: 'Corte + barba', precio: 15 },
  { nombre: 'Barba', precio: 7 },
];

// PIN configurable desde .env.local / Vercel (NEXT_PUBLIC_BARBER_PIN) o '1234' por defecto
const PIN_BARBERO = process.env.NEXT_PUBLIC_BARBER_PIN || '1234';
const AUTH_SESSION_KEY = 'pegate_ahi_barbero_auth';

const getFechaLocalStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function BarberoPinGate({
  isDark,
  onUnlock,
}: {
  isDark: boolean;
  onUnlock: () => void;
}) {
  const [pinIngresado, setPinIngresado] = useState<string>('');
  const [errorPin, setErrorPin] = useState<boolean>(false);

  const verificarPin = (codigo: string) => {
    if (codigo === PIN_BARBERO) {
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
      } catch {
        // Ignorar si sessionStorage está restringido
      }
      onUnlock();
    } else {
      setErrorPin(true);
      setTimeout(() => {
        setPinIngresado('');
        setErrorPin(false);
      }, 650);
    }
  };

  const agregarDigito = (digito: string) => {
    if (errorPin || pinIngresado.length >= PIN_BARBERO.length) return;
    const nuevo = pinIngresado + digito;
    setPinIngresado(nuevo);
    if (nuevo.length === PIN_BARBERO.length) {
      verificarPin(nuevo);
    }
  };

  const borrarDigito = () => {
    if (errorPin) return;
    setPinIngresado((prev) => prev.slice(0, -1));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        agregarDigito(e.key);
      } else if (e.key === 'Backspace') {
        borrarDigito();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="py-4 text-center space-y-6">
      <div>
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-[#C59B27]/60 text-white flex items-center justify-center text-3xl mx-auto shadow-md">
          🔐
        </div>
        <h1 className="text-2xl font-black mt-3">Acceso Barbero</h1>
        <p className="text-xs font-semibold text-zinc-400 mt-1">
          Ingresa el PIN de seguridad para gestionar la silla y las citas
        </p>
      </div>

      {/* Indicadores de dígitos */}
      <div className="flex items-center justify-center gap-3.5">
        {Array.from({ length: PIN_BARBERO.length }).map((_, idx) => {
          const lleno = idx < pinIngresado.length;
          return (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                errorPin
                  ? 'bg-[#DC2626] border-[#DC2626] scale-110'
                  : lleno
                  ? 'bg-[#C59B27] border-[#C59B27] scale-110'
                  : isDark
                  ? 'border-zinc-700 bg-zinc-950'
                  : 'border-zinc-300 bg-zinc-100'
              }`}
            />
          );
        })}
      </div>

      {errorPin ? (
        <p className="text-xs font-black text-[#DC2626] uppercase tracking-wider">
          PIN incorrecto · Intenta de nuevo
        </p>
      ) : (
        <p className="text-xs text-zinc-500">PIN de {PIN_BARBERO.length} dígitos</p>
      )}

      {/* Teclado numérico táctil */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[270px] mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => agregarDigito(num)}
            className={`h-14 rounded-2xl border text-xl font-black transition-all active:scale-95 ${
              isDark
                ? 'bg-zinc-900/90 border-zinc-800 text-white hover:border-[#C59B27]'
                : 'bg-zinc-50 border-zinc-200 text-zinc-900 hover:border-zinc-400'
            }`}
          >
            {num}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setPinIngresado('')}
          className={`h-14 rounded-2xl border text-xs font-extrabold uppercase transition-all active:scale-95 ${
            isDark
              ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
              : 'bg-zinc-100 border-zinc-200 text-zinc-500'
          }`}
        >
          Limpiar
        </button>

        <button
          type="button"
          onClick={() => agregarDigito('0')}
          className={`h-14 rounded-2xl border text-xl font-black transition-all active:scale-95 ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-white hover:border-[#C59B27]'
              : 'bg-zinc-50 border-zinc-200 text-zinc-900 hover:border-zinc-400'
          }`}
        >
          0
        </button>

        <button
          type="button"
          onClick={borrarDigito}
          className={`h-14 rounded-2xl border text-base font-black transition-all active:scale-95 ${
            isDark
              ? 'bg-zinc-950 border-zinc-800 text-[#DC2626] hover:border-[#DC2626]'
              : 'bg-zinc-100 border-zinc-200 text-[#DC2626]'
          }`}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

function BarberoContent({ isDark }: { isDark: boolean }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [turnosFinalizados, setTurnosFinalizados] = useState<Turno[]>([]);
  const [citasDelDia, setCitasDelDia] = useState<Cita[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [horaActual, setHoraActual] = useState<string>('');
  const [hoyStr, setHoyStr] = useState<string>('');
  const [minutosRestantes, setMinutosRestantes] = useState<number | null>(null);

  const [tabActiva, setTabActiva] = useState<'silla' | 'citas' | 'qr' | 'horarios'>('silla');
  const [clienteUrl, setClienteUrl] = useState<string>('');
  const [copiadoUrl, setCopiadoUrl] = useState<boolean>(false);

  const [diaSeleccionado, setDiaSeleccionado] = useState<number>(1);
  const [bloques, setBloques] = useState<any[]>([]);
  const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const [tipoServicio, setTipoServicio] = useState<string>('Corte clásico');
  const [precioServicio, setPrecioServicio] = useState<number>(10);
  const [editandoServicio, setEditandoServicio] = useState<boolean>(false);

  const [nuevoTipoInput, setNuevoTipoInput] = useState<string>('Corte clásico');
  const [nuevoPrecioInput, setNuevoPrecioInput] = useState<string>('10');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setClienteUrl(`${window.location.origin}/cliente`);
    }

    setHoyStr(getFechaLocalStr());
    const hoy = new Date().getDay();
    setDiaSeleccionado(hoy === 0 ? 0 : hoy);

    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
      setHoyStr(getFechaLocalStr());
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const cargarBloques = async () => {
      const { data } = await supabase
        .from('horarios_disponibles')
        .select('*')
        .eq('dia_semana', diaSeleccionado)
        .order('hora_inicio', { ascending: true });
      if (data) setBloques(data);
    };
    cargarBloques();
  }, [diaSeleccionado]);

  const toggleBloque = async (id: string, estadoActual: boolean) => {
    setBloques(bloques.map((b) => (b.id === id ? { ...b, activo: !estadoActual } : b)));
    await supabase
      .from('horarios_disponibles')
      .update({ activo: !estadoActual })
      .eq('id', id);
  };

  useEffect(() => {
    const cargarPreciosBase = async () => {
      const { data } = await supabase.from('servicios_config').select('*');
      if (data && data.length > 0) {
        const servicioActual = data.find((s) => s.nombre === tipoServicio);
        if (servicioActual) setPrecioServicio(Number(servicioActual.precio));
      }
    };
    cargarPreciosBase();
  }, [tipoServicio]);

  const fetchTurnosYCitas = async () => {
    const { data: activos } = await supabase
      .from('turnos')
      .select('*')
      .in('estado', ['espera', 'atendiendo'])
      .order('creado_en', { ascending: true });

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data: finalizados } = await supabase
      .from('turnos')
      .select('*')
      .eq('estado', 'finalizado')
      .gte('creado_en', inicioHoy.toISOString())
      .order('creado_en', { ascending: false });

    const fechaHoyStr = getFechaLocalStr();
    const { data: citas } = await supabase
      .from('citas')
      .select('*')
      .gte('fecha', fechaHoyStr)
      .neq('estado', 'cancelada')
      .neq('estado', 'atendida')
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (activos) setTurnos(activos as Turno[]);
    if (finalizados) setTurnosFinalizados(finalizados as Turno[]);
    if (citas) setCitasDelDia(citas as Cita[]);

    setLoading(false);
  };

  useEffect(() => {
    fetchTurnosYCitas();
    const channelTurnos = supabase
      .channel('barbero_turnos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        fetchTurnosYCitas();
      })
      .subscribe();

    const channelCitas = supabase
      .channel('barbero_citas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => {
        fetchTurnosYCitas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelTurnos);
      supabase.removeChannel(channelCitas);
    };
  }, []);

  const citasDeHoy = hoyStr ? citasDelDia.filter((c) => c.fecha === hoyStr) : [];
  const citasSiguientes = hoyStr ? citasDelDia.filter((c) => c.fecha > hoyStr) : citasDelDia;

  const turnoActual = turnos.find((t) => t.estado === 'atendiendo');
  const colaEspera = turnos.filter((t) => t.estado === 'espera');

  const totalIngresos = turnosFinalizados.reduce((acc, t) => acc + (t.monto || 0), 0);
  const totalAtendidos = turnosFinalizados.length;

  const tiempoPromedioMinutos = (() => {
    const serviciosConTiempo = turnosFinalizados.filter((t) => t.llamado_en && t.finalizado_en);
    if (serviciosConTiempo.length === 0) return APP_CONFIG.tiempoEstimadoPorClienteMin;
    const totalMinutos = serviciosConTiempo.reduce((acc, t) => {
      const inicio = new Date(t.llamado_en!).getTime();
      const fin = new Date(t.finalizado_en!).getTime();
      return acc + (fin - inicio) / 60000;
    }, 0);
    return Math.round(totalMinutos / serviciosConTiempo.length);
  })();

  const enviarWhatsAppTurno = (telefono: string, nombre: string, ticket: string) => {
    let numLimpio = telefono.replace(/\D/g, '');
    if (numLimpio.startsWith('0')) numLimpio = '58' + numLimpio.substring(1);
    const mensaje = encodeURIComponent(
      `¡Hola ${nombre}! ✂️ Tu turno ${ticket} ha sido llamado en ${APP_CONFIG.nombreNegocio}. Dispones de ${APP_CONFIG.tiempoLimiteDiligenciaMin} minutos para llegar al local.`
    );
    window.open(`https://wa.me/${numLimpio}?text=${mensaje}`, '_blank');
  };

  const procesarNotificacionCitaWA = async (cita: Cita, telefonoEspecifico?: string) => {
    const telefonoFinal = telefonoEspecifico || cita.cliente_telefono;
    if (!telefonoFinal) return;

    const fechaActual = getFechaLocalStr();
    const esHoy = cita.fecha === fechaActual;
    const textoCuando = esHoy ? 'hoy' : `el día ${cita.fecha}`;

    let numLimpio = telefonoFinal.replace(/\D/g, '');
    if (numLimpio.startsWith('0')) numLimpio = '58' + numLimpio.substring(1);
    const mensaje = encodeURIComponent(
      `¡Hola ${cita.nombre_cliente}! 📅 Te recordamos tu cita agendada (${cita.codigo_ticket}) para ${textoCuando} a las ${cita.hora_inicio.substring(0, 5)} hrs en ${APP_CONFIG.nombreNegocio}. ¡Te esperamos!`
    );
    window.open(`https://wa.me/${numLimpio}?text=${mensaje}`, '_blank');

    if (esHoy) {
      await supabase.from('turnos').insert([
        {
          codigo_ticket: cita.codigo_ticket,
          nombre_cliente: cita.nombre_cliente,
          cliente_telefono: telefonoFinal,
          tipo_corte: cita.tipo_corte,
          monto: cita.monto,
          modalidad_espera: 'local',
          estado: 'espera',
        },
      ]);

      await supabase
        .from('citas')
        .update({ estado: 'atendida', cliente_telefono: telefonoFinal })
        .eq('id', cita.id);
    } else if (telefonoEspecifico) {
      await supabase
        .from('citas')
        .update({ cliente_telefono: telefonoEspecifico })
        .eq('id', cita.id);
    }

    fetchTurnosYCitas();
  };

  const handleTipoChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const seleccionado = e.target.value;
    setNuevoTipoInput(seleccionado);

    const { data } = await supabase
      .from('servicios_config')
      .select('precio')
      .eq('nombre', seleccionado)
      .maybeSingle();

    if (data) {
      setNuevoPrecioInput(data.precio.toString());
    } else {
      const servicioEncontrado = SERVICIOS_DEFAULT.find((s) => s.nombre === seleccionado);
      if (servicioEncontrado) {
        setNuevoPrecioInput(servicioEncontrado.precio.toString());
      }
    }
  };

  const guardarNuevoServicio = async () => {
    const valorPrecio = parseFloat(nuevoPrecioInput);
    if (isNaN(valorPrecio) || valorPrecio < 0) return;

    let servicioId = 'corte_clasico';
    if (nuevoTipoInput === 'Corte + barba') servicioId = 'corte_barba';
    if (nuevoTipoInput === 'Barba') servicioId = 'barba';

    await supabase
      .from('servicios_config')
      .update({ precio: valorPrecio })
      .eq('id', servicioId);

    if (turnoActual) {
      await supabase
        .from('turnos')
        .update({
          tipo_corte: nuevoTipoInput,
          monto: valorPrecio,
        })
        .eq('id', turnoActual.id);
      await fetchTurnosYCitas();
    }

    setTipoServicio(nuevoTipoInput);
    setPrecioServicio(valorPrecio);
    setEditandoServicio(false);
  };

  const desplazarPorTiempoAgotado = async (turnoExpirado: Turno) => {
    await supabase
      .from('turnos')
      .update({
        estado: 'espera',
        llamado_en: null,
        creado_en: new Date().toISOString(),
      })
      .eq('id', turnoExpirado.id);

    const colaRestante = turnos.filter(
      (t) => t.estado === 'espera' && t.id !== turnoExpirado.id
    );

    if (colaRestante.length > 0) {
      const clienteEnLocal = colaRestante.find((t) => t.modalidad_espera === 'local');
      const siguiente = clienteEnLocal || colaRestante[0];

      await supabase
        .from('turnos')
        .update({
          estado: 'atendiendo',
          llamado_en: new Date().toISOString(),
        })
        .eq('id', siguiente.id);

      if (siguiente.cliente_telefono && siguiente.modalidad_espera === 'diligencia') {
        enviarWhatsAppTurno(
          siguiente.cliente_telefono,
          siguiente.nombre_cliente,
          siguiente.codigo_ticket
        );
      }
    }

    await fetchTurnosYCitas();
  };

  useEffect(() => {
    if (turnoActual && turnoActual.modalidad_espera === 'diligencia' && turnoActual.llamado_en) {
      const interval = setInterval(() => {
        const horaLlamado = new Date(turnoActual.llamado_en!).getTime();
        const ahora = new Date().getTime();
        const transcurridoMin = Math.floor((ahora - horaLlamado) / 60000);
        const restante = APP_CONFIG.tiempoLimiteDiligenciaMin - transcurridoMin;

        if (restante <= 0) {
          clearInterval(interval);
          desplazarPorTiempoAgotado(turnoActual);
        } else {
          setMinutosRestantes(restante);
        }
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setMinutosRestantes(null);
    }
  }, [turnoActual]);

  const llamarSiguiente = async () => {
    if (colaEspera.length === 0) return;

    if (turnoActual && turnoActual.modalidad_espera === 'diligencia') {
      await supabase
        .from('turnos')
        .update({
          estado: 'espera',
          llamado_en: null,
          creado_en: new Date().toISOString(),
        })
        .eq('id', turnoActual.id);
    }

    const clienteEnLocal = colaEspera.find((t) => t.modalidad_espera === 'local');
    const siguiente = clienteEnLocal || colaEspera[0];

    await supabase
      .from('turnos')
      .update({
        estado: 'atendiendo',
        llamado_en: new Date().toISOString(),
      })
      .eq('id', siguiente.id);

    if (siguiente.cliente_telefono && siguiente.modalidad_espera === 'diligencia') {
      enviarWhatsAppTurno(
        siguiente.cliente_telefono,
        siguiente.nombre_cliente,
        siguiente.codigo_ticket
      );
    }

    fetchTurnosYCitas();
  };

  const confirmarLlegadaCliente = async () => {
    if (!turnoActual) return;
    await supabase
      .from('turnos')
      .update({ modalidad_espera: 'local', llamado_en: null })
      .eq('id', turnoActual.id);
    fetchTurnosYCitas();
  };

  const pasarSiguientePorAusencia = async () => {
    if (!turnoActual) return;

    await supabase
      .from('turnos')
      .update({
        estado: 'espera',
        llamado_en: null,
        creado_en: new Date().toISOString(),
      })
      .eq('id', turnoActual.id);

    const colaRestante = turnos.filter(
      (t) => t.estado === 'espera' && t.id !== turnoActual.id
    );

    if (colaRestante.length > 0) {
      const clienteEnLocal = colaRestante.find((t) => t.modalidad_espera === 'local');
      const siguiente = clienteEnLocal || colaRestante[0];

      await supabase
        .from('turnos')
        .update({
          estado: 'atendiendo',
          llamado_en: new Date().toISOString(),
        })
        .eq('id', siguiente.id);

      if (siguiente.cliente_telefono && siguiente.modalidad_espera === 'diligencia') {
        enviarWhatsAppTurno(
          siguiente.cliente_telefono,
          siguiente.nombre_cliente,
          siguiente.codigo_ticket
        );
      }
    }

    await fetchTurnosYCitas();
  };

  const finalizarServicio = async () => {
    if (!turnoActual) return;
    await supabase
      .from('turnos')
      .update({
        estado: 'finalizado',
        finalizado_en: new Date().toISOString(),
        monto: turnoActual.monto || precioServicio,
        tipo_corte: turnoActual.tipo_corte || tipoServicio,
      })
      .eq('id', turnoActual.id);

    fetchTurnosYCitas();
  };

  const copiarEnlaceCliente = async () => {
    if (!clienteUrl) return;
    try {
      await navigator.clipboard.writeText(clienteUrl);
      setCopiadoUrl(true);
      setTimeout(() => setCopiadoUrl(false), 2000);
    } catch {
      console.log('No se pudo copiar');
    }
  };

  const qrImageUrl = clienteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=0F172A&bgcolor=FFFFFF&data=${encodeURIComponent(clienteUrl)}`
    : '';

  const cardSurface = isDark
    ? 'bg-zinc-900/90 border-zinc-800 text-zinc-100'
    : 'bg-zinc-50 border-zinc-200 text-zinc-900';

  return (
    <div className="space-y-4">
      {/* Perfil del barbero + indicadores */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-[#C59B27]/60 text-white flex items-center justify-center text-2xl shrink-0">
            🧔🏻
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight">
              {APP_CONFIG.nombreNegocio || 'Panel Barbero'}
            </h1>
            <p className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              En línea · {horaActual}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-center ${cardSurface}`}>
            <span className="text-[11px] uppercase font-bold text-zinc-400 block">Caja</span>
            <span className="text-sm font-black text-[#C59B27]">
              {APP_CONFIG.monedaSimbolo}
              {totalIngresos}
            </span>
          </div>
          <div className={`px-3 py-1.5 rounded-xl border text-center ${cardSurface}`}>
            <span className="text-[11px] uppercase font-bold text-zinc-400 block">Cortes</span>
            <span className="text-sm font-black">{totalAtendidos}</span>
          </div>
        </div>
      </div>

      {/* Pestañas con acentos discretos */}
      <div
        className={`grid grid-cols-4 gap-1.5 p-1.5 rounded-xl border ${
          isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setTabActiva('silla')}
          className={`py-2.5 rounded-lg text-xs font-black transition-all ${
            tabActiva === 'silla'
              ? 'bg-[#DC2626] text-white shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Silla ({colaEspera.length})
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('qr')}
          className={`py-2.5 rounded-lg text-xs font-black transition-all ${
            tabActiva === 'qr'
              ? 'bg-white text-zinc-950 shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          📷 QR Hoy
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('citas')}
          className={`py-2.5 rounded-lg text-xs font-black transition-all ${
            tabActiva === 'citas'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Citas ({citasDelDia.length})
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('horarios')}
          className={`py-2.5 rounded-lg text-xs font-black transition-all ${
            tabActiva === 'horarios'
              ? 'bg-[#C59B27] text-zinc-950 shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Horarios
        </button>
      </div>

      {/* --- TAB 1: SILLA & COLA EN VIVO --- */}
      {tabActiva === 'silla' && (
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl border border-[#C59B27]/40 space-y-4 ${cardSurface}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                En Silla Ahora
              </span>
              {turnoActual && (
                <span className="text-xs font-black px-3 py-0.5 rounded-full bg-[#DC2626]/15 text-[#DC2626] border border-[#DC2626]/30">
                  {turnoActual.modalidad_espera === 'diligencia' ? '🏃‍♂️ En camino' : '✂️ Atendiendo'}
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-center text-sm text-zinc-400 py-6 animate-pulse">Cargando...</p>
            ) : turnoActual ? (
              <div className="space-y-4">
                {turnoActual.cliente_llego && (
                  <div className="p-3 rounded-xl bg-emerald-600 text-white text-center text-xs font-black">
                    📍 ¡El cliente ya llegó al local!
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-2.5 rounded-xl bg-[#DC2626] text-white text-base font-black shrink-0">
                      {turnoActual.codigo_ticket}
                    </div>
                    <div>
                      <h3 className="text-lg font-black leading-tight">
                        {turnoActual.nombre_cliente}
                      </h3>
                      <p className="text-sm font-semibold text-zinc-400">
                        {turnoActual.tipo_corte || tipoServicio}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-[#C59B27]">
                      {APP_CONFIG.monedaSimbolo}
                      {turnoActual.monto || precioServicio}
                    </p>
                  </div>
                </div>

                {editandoServicio ? (
                  <div
                    className={`p-3.5 rounded-xl border space-y-3 ${
                      isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'
                    }`}
                  >
                    <div className="flex gap-2">
                      <select
                        value={nuevoTipoInput}
                        onChange={handleTipoChange}
                        className={`flex-1 px-3 py-2.5 text-sm font-bold rounded-lg border focus:outline-none ${
                          isDark
                            ? 'bg-zinc-900 border-zinc-700 text-white'
                            : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                        }`}
                      >
                        <option value="Corte clásico">Corte clásico</option>
                        <option value="Corte + barba">Corte + barba</option>
                        <option value="Barba">Barba</option>
                      </select>
                      <input
                        type="number"
                        step="0.5"
                        value={nuevoPrecioInput}
                        onChange={(e) => setNuevoPrecioInput(e.target.value)}
                        className={`w-24 px-3 py-2.5 text-sm font-bold rounded-lg border focus:outline-none ${
                          isDark
                            ? 'bg-zinc-900 border-zinc-700 text-white'
                            : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                        }`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditandoServicio(false)}
                        className="flex-1 py-2.5 rounded-lg text-xs font-bold border border-zinc-700 text-zinc-400"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={guardarNuevoServicio}
                        className="flex-1 py-2.5 rounded-lg text-xs font-black bg-[#C59B27] text-zinc-950"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setNuevoTipoInput(turnoActual.tipo_corte || tipoServicio);
                        setNuevoPrecioInput((turnoActual.monto || precioServicio).toString());
                        setEditandoServicio(true);
                      }}
                      className="text-xs font-bold text-zinc-400 hover:text-white"
                    >
                      ✏️ Cambiar servicio/monto
                    </button>

                    {turnoActual.cliente_telefono && (
                      <button
                        type="button"
                        onClick={() =>
                          enviarWhatsAppTurno(
                            turnoActual.cliente_telefono!,
                            turnoActual.nombre_cliente,
                            turnoActual.codigo_ticket
                          )
                        }
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black"
                      >
                        📲 WhatsApp
                      </button>
                    )}
                  </div>
                )}

                {turnoActual.modalidad_espera === 'diligencia' &&
                  minutosRestantes !== null &&
                  !turnoActual.cliente_llego && (
                    <div
                      className={`p-4 rounded-xl border text-center space-y-2.5 ${
                        isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <p className="text-xs font-bold text-zinc-400">
                        Tiempo límite:{' '}
                        <span className="text-[#DC2626] font-black">{minutosRestantes} min</span>
                      </p>
                      <button
                        type="button"
                        onClick={confirmarLlegadaCliente}
                        className="w-full py-3 rounded-lg bg-[#2563EB] text-white font-black text-xs"
                      >
                        💈 Confirmar Llegada al Local
                      </button>
                    </div>
                  )}
              </div>
            ) : (
              <div className="py-6 text-center space-y-1.5">
                <span className="text-4xl block">💺</span>
                <p className="text-base font-black">Silla disponible</p>
                <p className="text-xs text-zinc-400">
                  Llama al siguiente cliente o muestra el QR
                </p>
              </div>
            )}

            <div className="pt-1">
              {!turnoActual ? (
                <div className="flex gap-2">
                  <button
                    onClick={llamarSiguiente}
                    disabled={colaEspera.length === 0}
                    className="flex-1 py-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-sm tracking-wide shadow-md active:scale-95 disabled:opacity-40"
                  >
                    📢 Llamar ({colaEspera.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabActiva('qr')}
                    className="px-4 py-4 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-black text-sm active:scale-95"
                  >
                    📷 QR
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {turnoActual.modalidad_espera === 'diligencia' && (
                    <button
                      onClick={pasarSiguientePorAusencia}
                      className="flex-1 py-4 rounded-xl border border-[#DC2626] text-[#DC2626] font-black text-sm"
                    >
                      Ausente
                    </button>
                  )}
                  <button
                    onClick={finalizarServicio}
                    className="flex-1 py-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-sm tracking-wide shadow-md active:scale-95"
                  >
                    ✅ Finalizar Corte
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Espera del mismo día */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-black">Cola de hoy ({colaEspera.length})</span>
              <span className="text-xs font-bold text-zinc-400">
                Prom. ~{tiempoPromedioMinutos}m
              </span>
            </div>

            {colaEspera.length === 0 ? (
              <div className={`p-5 rounded-xl border text-center text-sm text-zinc-400 ${cardSurface}`}>
                No hay clientes en espera hoy.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
                {colaEspera.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border flex items-center justify-between ${cardSurface}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-white flex items-center justify-center text-sm font-black shrink-0">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black">{item.nombre_cliente}</span>
                          <span className="text-xs font-black text-[#DC2626]">
                            ({item.codigo_ticket})
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 font-semibold mt-0.5">
                          {item.tipo_corte} ·{' '}
                          {item.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera' : '💈 Local'}
                        </p>
                      </div>
                    </div>

                    <span className="text-base font-black text-[#C59B27]">
                      {APP_CONFIG.monedaSimbolo}
                      {item.monto || precioServicio}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: QR DEL DÍA --- */}
      {tabActiva === 'qr' && (
        <div className={`p-6 rounded-2xl border text-center space-y-4 ${cardSurface}`}>
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-[#C59B27]/15 text-[#C59B27] border border-[#C59B27]/30 text-xs font-extrabold uppercase tracking-wider">
              Registro Rápido en Local
            </span>
            <h3 className="text-lg font-black mt-2">Escanea para tomar tu turno hoy</h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              El cliente entra directo a la cola del día y sigue su turno en vivo desde su teléfono.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border-2 border-[#C59B27]/50 inline-block mx-auto">
            {qrImageUrl ? (
              <img src={qrImageUrl} alt="QR Cola Barbería" className="w-48 h-48 rounded-lg" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-sm text-zinc-400">
                Generando QR...
              </div>
            )}
          </div>

          <div
            className={`p-3 rounded-lg border text-xs font-mono truncate ${
              isDark
                ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                : 'bg-white border-zinc-200 text-zinc-600'
            }`}
          >
            {clienteUrl}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={copiarEnlaceCliente}
              className="flex-1 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-black text-xs active:scale-95"
            >
              {copiadoUrl ? '✅ Copiado' : '📋 Copiar Enlace'}
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('silla')}
              className="flex-1 py-3.5 rounded-xl bg-[#DC2626] text-white font-black text-xs active:scale-95"
            >
              Volver a Silla
            </button>
          </div>
        </div>
      )}

      {/* --- TAB 3: AGENDA DE CITAS --- */}
      {tabActiva === 'citas' && (
        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-0.5">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-black">📅 Citas de Hoy ({citasDeHoy.length})</span>
              <span className="text-xs text-zinc-400">Pasar a cola al llegar</span>
            </div>

            {citasDeHoy.length === 0 ? (
              <div className={`p-4 rounded-xl border text-center text-sm text-zinc-400 ${cardSurface}`}>
                Sin citas agendadas para hoy.
              </div>
            ) : (
              <div className="space-y-2.5">
                {citasDeHoy.map((cita) => (
                  <div
                    key={cita.id}
                    className={`p-4 rounded-xl border border-l-4 border-l-[#DC2626] flex items-center justify-between gap-2 ${cardSurface}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-2 rounded-lg bg-[#DC2626] text-white text-center shrink-0">
                        <span className="text-[11px] font-black uppercase block">HOY</span>
                        <span className="text-sm font-black">
                          {cita.hora_inicio.substring(0, 5)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-black leading-tight">
                          {cita.nombre_cliente}{' '}
                          <span className="text-[#DC2626]">({cita.codigo_ticket})</span>
                        </p>
                        <p className="text-xs text-zinc-400 font-semibold mt-0.5">
                          {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}
                          {cita.monto}
                        </p>
                      </div>
                    </div>

                    {cita.cliente_telefono ? (
                      <button
                        type="button"
                        onClick={() => procesarNotificacionCitaWA(cita)}
                        className="px-3.5 py-2.5 rounded-lg bg-[#2563EB] text-white font-black text-xs shrink-0 active:scale-95"
                      >
                        📲 Cola + WA
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const num = prompt(`Teléfono WhatsApp para ${cita.nombre_cliente}:`);
                          if (num) procesarNotificacionCitaWA(cita, num);
                        }}
                        className="px-3.5 py-2.5 rounded-lg bg-[#DC2626] text-white font-black text-xs shrink-0"
                      >
                        ➕ Tlf
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-black">
                🗓️ Próximos Días ({citasSiguientes.length})
              </span>
            </div>

            {citasSiguientes.length === 0 ? (
              <div className={`p-4 rounded-xl border text-center text-sm text-zinc-400 ${cardSurface}`}>
                No hay citas agendadas para los próximos días.
              </div>
            ) : (
              <div className="space-y-2.5">
                {citasSiguientes.map((cita) => (
                  <div
                    key={cita.id}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-2 ${cardSurface}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-center shrink-0">
                        <span className="text-[11px] font-bold text-zinc-400 block">
                          {cita.fecha.slice(5)}
                        </span>
                        <span className="text-sm font-black text-[#2563EB]">
                          {cita.hora_inicio.substring(0, 5)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-black leading-tight">
                          {cita.nombre_cliente}{' '}
                          <span className="text-[#C59B27]">({cita.codigo_ticket})</span>
                        </p>
                        <p className="text-xs text-zinc-400 font-semibold mt-0.5">
                          {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}
                          {cita.monto}
                        </p>
                      </div>
                    </div>

                    {cita.cliente_telefono ? (
                      <button
                        type="button"
                        onClick={() => procesarNotificacionCitaWA(cita)}
                        className="px-3.5 py-2.5 rounded-lg bg-[#DC2626] text-white font-black text-xs shrink-0 active:scale-95"
                      >
                        📲 WA
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const num = prompt(`Teléfono WhatsApp para ${cita.nombre_cliente}:`);
                          if (num) procesarNotificacionCitaWA(cita, num);
                        }}
                        className="px-3.5 py-2.5 rounded-lg bg-[#2563EB] text-white font-black text-xs shrink-0"
                      >
                        ➕ Tlf
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 4: GESTOR DE HORARIOS --- */}
      {tabActiva === 'horarios' && (
        <div className={`p-5 rounded-2xl border space-y-4 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-black">Horarios disponibles</span>
            <select
              value={diaSeleccionado}
              onChange={(e) => setDiaSeleccionado(Number(e.target.value))}
              className="px-4 py-2 text-sm font-black rounded-xl bg-zinc-950 border border-[#C59B27]/50 text-white focus:outline-none"
            >
              {diasNombres.map((d, idx) => (
                <option key={idx} value={idx}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {bloques.map((bloque) => (
              <button
                key={bloque.id}
                type="button"
                onClick={() => toggleBloque(bloque.id, bloque.activo)}
                className={`py-2.5 rounded-xl border text-sm font-black transition-all ${
                  bloque.activo
                    ? isDark
                      ? 'bg-zinc-950 border-[#2563EB]/60 text-white'
                      : 'bg-white border-[#2563EB] text-[#2563EB]'
                    : 'bg-[#DC2626]/10 border-[#DC2626]/30 text-[#DC2626] line-through opacity-75'
                }`}
              >
                {bloque.hora_inicio.substring(0, 5)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BarberoView() {
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('dark');
  const [esNoche, setEsNoche] = useState<boolean>(true);
  const [autorizado, setAutorizado] = useState<boolean>(false);
  const [verificandoSesion, setVerificandoSesion] = useState<boolean>(true);

  useEffect(() => {
    const hora = new Date().getHours();
    setEsNoche(hora >= 19 || hora < 6);

    try {
      const sesion = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (sesion === 'true') {
        setAutorizado(true);
      }
    } catch {
      // Ignorar
    }
    setVerificandoSesion(false);
  }, []);

  const bloquearPanel = () => {
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch {
      // Ignorar
    }
    setAutorizado(false);
  };

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 ${
        isDark ? 'bg-[#09090B] text-white' : 'bg-[#F4F4F5] text-zinc-900'
      }`}
    >
      <div
        className={`w-full max-w-[460px] rounded-3xl p-3 sm:p-4 shadow-2xl border transition-colors ${
          isDark ? 'bg-[#121215] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="rounded-2xl border border-[#C59B27]/60 p-5 sm:p-6">
          <div
            className={`flex items-center justify-between pb-3 mb-4 border-b ${
              isDark ? 'border-zinc-800' : 'border-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                  isDark
                    ? 'bg-zinc-900 text-white border border-zinc-800 hover:border-[#C59B27]'
                    : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
                }`}
              >
                ← Inicio
              </Link>

              {autorizado && (
                <button
                  type="button"
                  onClick={bloquearPanel}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#DC2626]/15 border border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626] hover:text-white text-xs font-extrabold transition-all"
                  title="Bloquear panel con PIN"
                >
                  🔒 Bloquear
                </button>
              )}
            </div>

            <div
              className={`flex items-center gap-1 p-1 rounded-full border text-xs font-bold ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
              }`}
            >
              <button
                onClick={() => setModoTema('light')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'light' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-400'
                }`}
              >
                ☀️
              </button>
              <button
                onClick={() => setModoTema('dark')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'dark' ? 'bg-[#C59B27] text-zinc-950 shadow-xs' : 'text-zinc-400'
                }`}
              >
                🌙
              </button>
              <button
                onClick={() => setModoTema('auto')}
                className={`px-2.5 h-7 rounded-full transition-all ${
                  modoTema === 'auto' ? 'bg-[#DC2626] text-white shadow-xs' : 'text-zinc-400'
                }`}
              >
                Auto
              </button>
            </div>
          </div>

          {verificandoSesion ? (
            <p className="text-center text-sm text-zinc-400 py-10">Verificando acceso...</p>
          ) : autorizado ? (
            <BarberoContent isDark={isDark} />
          ) : (
            <BarberoPinGate isDark={isDark} onUnlock={() => setAutorizado(true)} />
          )}
        </div>
      </div>
    </main>
  );
}
