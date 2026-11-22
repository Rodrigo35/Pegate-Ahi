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

const getFechaLocalStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function BarberoContent() {
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

      await supabase.from('citas').update({ estado: 'atendida', cliente_telefono: telefonoFinal }).eq('id', cita.id);
    } else if (telefonoEspecifico) {
      await supabase.from('citas').update({ cliente_telefono: telefonoEspecifico }).eq('id', cita.id);
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
          monto: valorPrecio
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
        creado_en: new Date().toISOString()
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
        enviarWhatsAppTurno(siguiente.cliente_telefono, siguiente.nombre_cliente, siguiente.codigo_ticket);
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
          creado_en: new Date().toISOString()
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
      enviarWhatsAppTurno(siguiente.cliente_telefono, siguiente.nombre_cliente, siguiente.codigo_ticket);
    }

    fetchTurnosYCitas();
  };

  const confirmarLlegadaCliente = async () => {
    if (!turnoActual) return;
    await supabase.from('turnos').update({ modalidad_espera: 'local', llamado_en: null }).eq('id', turnoActual.id);
    fetchTurnosYCitas();
  };

  const pasarSiguientePorAusencia = async () => {
    if (!turnoActual) return;

    await supabase
      .from('turnos')
      .update({
        estado: 'espera',
        llamado_en: null,
        creado_en: new Date().toISOString()
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
        enviarWhatsAppTurno(siguiente.cliente_telefono, siguiente.nombre_cliente, siguiente.codigo_ticket);
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
        tipo_corte: turnoActual.tipo_corte || tipoServicio
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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=072742&bgcolor=FFFFFF&data=${encodeURIComponent(clienteUrl)}`
    : '';

  return (
    <div className="space-y-4">
      {/* Encabezado y Métricas en bloques Amarillo y Turquesa */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-[#C62828] leading-none">
            {APP_CONFIG.nombreNegocio || 'BARBER SHOP'}
          </h1>
          <p className="text-[11px] font-bold text-[#37B9C5] flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            EN LÍNEA · {horaActual}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-[#F5D042] text-[#072742] text-center shadow">
            <span className="text-[9px] uppercase font-black block">CAJA</span>
            <span className="text-xs font-black">{APP_CONFIG.monedaSimbolo}{totalIngresos}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#37B9C5] text-[#072742] text-center shadow">
            <span className="text-[9px] uppercase font-black block">CORTES</span>
            <span className="text-xs font-black">{totalAtendidos}</span>
          </div>
        </div>
      </div>

      {/* Pestañas estilo botones retro */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#04182B] p-1.5 rounded-xl border border-[#143F66]">
        <button
          type="button"
          onClick={() => setTabActiva('silla')}
          className={`py-2 rounded-lg text-[11px] font-black uppercase transition-all ${
            tabActiva === 'silla'
              ? 'bg-[#C62828] text-white shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Silla ({colaEspera.length})
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('qr')}
          className={`py-2 rounded-lg text-[11px] font-black uppercase transition-all ${
            tabActiva === 'qr'
              ? 'bg-[#F5D042] text-[#072742] shadow'
              : 'text-[#F5D042] hover:bg-white/5'
          }`}
        >
          📷 QR Hoy
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('citas')}
          className={`py-2 rounded-lg text-[11px] font-black uppercase transition-all ${
            tabActiva === 'citas'
              ? 'bg-[#37B9C5] text-[#072742] shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Citas ({citasDelDia.length})
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('horarios')}
          className={`py-2 rounded-lg text-[11px] font-black uppercase transition-all ${
            tabActiva === 'horarios'
              ? 'bg-white text-[#072742] shadow'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Horas
        </button>
      </div>

      {/* --- TAB 1: SILLA & COLA EN VIVO --- */}
      {tabActiva === 'silla' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#0B3559] border-2 border-[#144673] space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-[#F5D042]">
                EN SILLA AHORA
              </span>
              {turnoActual && (
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded bg-[#37B9C5] text-[#072742] uppercase">
                  {turnoActual.modalidad_espera === 'diligencia' ? '🏃‍♂️ En camino' : '✂️ Atendiendo'}
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-center text-xs text-slate-300 py-6 animate-pulse">Cargando...</p>
            ) : turnoActual ? (
              <div className="space-y-4">
                {turnoActual.cliente_llego && (
                  <div className="p-2.5 rounded-xl bg-[#F5D042] text-[#072742] text-center text-[11px] font-black uppercase">
                    📍 ¡El cliente ya llegó al local!
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#C62828] text-white flex items-center justify-center text-base font-black shrink-0 shadow">
                      {turnoActual.codigo_ticket}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white leading-tight">{turnoActual.nombre_cliente}</h3>
                      <p className="text-xs text-[#37B9C5] font-bold">{turnoActual.tipo_corte || tipoServicio}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#F5D042]">
                      {APP_CONFIG.monedaSimbolo}{turnoActual.monto || precioServicio}
                    </p>
                  </div>
                </div>

                {editandoServicio ? (
                  <div className="p-3 rounded-xl bg-[#04182B] space-y-2.5">
                    <div className="flex gap-2">
                      <select
                        value={nuevoTipoInput}
                        onChange={handleTipoChange}
                        className="flex-1 px-3 py-2 text-xs font-bold rounded-lg bg-white text-[#072742] focus:outline-none"
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
                        className="w-20 px-3 py-2 text-xs font-bold rounded-lg bg-white text-[#072742] focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditandoServicio(false)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold border border-white/20 text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={guardarNuevoServicio}
                        className="flex-1 py-2 rounded-lg text-xs font-black bg-[#F5D042] text-[#072742]"
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
                      className="text-[11px] font-bold text-slate-300 hover:text-[#F5D042]"
                    >
                      ✏️ Cambiar servicio/monto
                    </button>

                    {turnoActual.cliente_telefono && (
                      <button
                        type="button"
                        onClick={() => enviarWhatsAppTurno(turnoActual.cliente_telefono!, turnoActual.nombre_cliente, turnoActual.codigo_ticket)}
                        className="px-3 py-1 rounded-lg bg-[#37B9C5] text-[#072742] text-[11px] font-black"
                      >
                        📲 WhatsApp
                      </button>
                    )}
                  </div>
                )}

                {turnoActual.modalidad_espera === 'diligencia' && minutosRestantes !== null && !turnoActual.cliente_llego && (
                  <div className="p-3.5 rounded-xl bg-[#04182B] text-center space-y-2">
                    <p className="text-[11px] font-bold text-slate-300">
                      Tiempo límite: <span className="text-[#F5D042] font-black">{minutosRestantes} min</span>
                    </p>
                    <button
                      type="button"
                      onClick={confirmarLlegadaCliente}
                      className="w-full py-2.5 rounded-lg bg-[#37B9C5] text-[#072742] font-black text-xs uppercase"
                    >
                      💈 Confirmar Llegada al Local
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-5 text-center space-y-1">
                <span className="text-3xl block">💺</span>
                <p className="text-xs font-black uppercase text-white">Silla disponible</p>
                <p className="text-[11px] text-slate-300">Llama al siguiente cliente o muestra el QR</p>
              </div>
            )}

            <div className="pt-1">
              {!turnoActual ? (
                <div className="flex gap-2">
                  <button
                    onClick={llamarSiguiente}
                    disabled={colaEspera.length === 0}
                    className="flex-1 py-3.5 rounded-xl bg-[#C62828] hover:bg-[#B02020] text-white font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 disabled:opacity-40"
                  >
                    📢 LLAMAR ({colaEspera.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTabActiva('qr')}
                    className="px-4 py-3.5 rounded-xl bg-[#F5D042] text-[#072742] font-black text-xs uppercase active:scale-95 shadow"
                  >
                    📷 QR
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  {turnoActual.modalidad_espera === 'diligencia' && (
                    <button
                      onClick={pasarSiguientePorAusencia}
                      className="flex-1 py-3.5 rounded-xl bg-[#04182B] border border-[#C62828] text-[#FF8A80] font-black text-xs uppercase"
                    >
                      Ausente
                    </button>
                  )}
                  <button
                    onClick={finalizarServicio}
                    className="flex-1 py-3.5 rounded-xl bg-[#37B9C5] hover:bg-[#2CA8B4] text-[#072742] font-black text-xs uppercase tracking-wider shadow-lg active:scale-95"
                  >
                    ✅ FINALIZAR CORTE
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Espera del mismo día */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase text-white">Cola de hoy ({colaEspera.length})</span>
              <span className="text-[11px] font-bold text-[#37B9C5]">Prom. ~{tiempoPromedioMinutos}m</span>
            </div>

            {colaEspera.length === 0 ? (
              <div className="p-5 rounded-2xl bg-[#0B3559] border border-[#144673] text-center text-xs text-slate-300">
                No hay clientes en espera hoy.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                {colaEspera.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#0B3559] border border-[#144673] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#F5D042] text-[#072742] flex items-center justify-center text-xs font-black shrink-0">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-white">{item.nombre_cliente}</span>
                          <span className="text-[10px] font-black text-[#37B9C5]">({item.codigo_ticket})</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          {item.tipo_corte} · {item.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera' : '💈 Local'}
                        </p>
                      </div>
                    </div>

                    <span className="text-sm font-black text-[#F5D042]">
                      {APP_CONFIG.monedaSimbolo}{item.monto || precioServicio}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: CÓDIGO QR PARA TURNO DEL MISMO DÍA --- */}
      {tabActiva === 'qr' && (
        <div className="p-6 rounded-2xl bg-[#0B3559] border-2 border-[#F5D042] text-center space-y-4">
          <div>
            <span className="inline-block px-3 py-1 rounded bg-[#37B9C5] text-[#072742] text-[10px] font-black uppercase tracking-widest">
              Registro Rápido en Local
            </span>
            <h3 className="text-base font-black uppercase text-white mt-2">Escanea para tomar turno hoy</h3>
            <p className="text-[11px] text-slate-300 mt-1">
              El cliente entra directo a la cola del día y sigue su turno en vivo desde su celular.
            </p>
          </div>

          <div className="w-56 h-56 rounded-full bg-white p-5 flex items-center justify-center mx-auto shadow-xl border-4 border-[#37B9C5]/40">
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="QR Cola Barbería"
                className="w-40 h-40 rounded-lg"
              />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-xs text-slate-400">
                Generando QR...
              </div>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-[#04182B] text-[11px] font-mono text-slate-300 truncate">
            {clienteUrl}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={copiarEnlaceCliente}
              className="flex-1 py-3 rounded-xl bg-[#F5D042] text-[#072742] font-black text-xs uppercase active:scale-95"
            >
              {copiadoUrl ? '✅ Copiado' : '📋 Copiar Link'}
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('silla')}
              className="flex-1 py-3 rounded-xl bg-[#C62828] text-white font-black text-xs uppercase active:scale-95"
            >
              Volver a Silla
            </button>
          </div>
        </div>
      )}

      {/* --- TAB 3: AGENDA DE CITAS (HOY + DÍAS SIGUIENTES) --- */}
      {tabActiva === 'citas' && (
        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-0.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase text-[#F5D042]">
                📅 Citas de Hoy ({citasDeHoy.length})
              </span>
              <span className="text-[10px] text-slate-300">Bajar a cola al llegar</span>
            </div>

            {citasDeHoy.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0B3559] border border-[#144673] text-center text-xs text-slate-300">
                Sin citas agendadas para hoy.
              </div>
            ) : (
              <div className="space-y-2">
                {citasDeHoy.map((cita) => (
                  <div
                    key={cita.id}
                    className="p-3.5 rounded-xl bg-[#0B3559] border-2 border-[#F5D042] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#C62828] text-white text-center shrink-0">
                        <span className="text-[8px] font-black uppercase block">HOY</span>
                        <span className="text-xs font-black">{cita.hora_inicio.substring(0, 5)}</span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-white leading-tight">
                          {cita.nombre_cliente} <span className="text-[#F5D042]">({cita.codigo_ticket})</span>
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}{cita.monto}
                        </p>
                      </div>
                    </div>

                    {cita.cliente_telefono ? (
                      <button
                        type="button"
                        onClick={() => procesarNotificacionCitaWA(cita)}
                        className="px-3 py-2 rounded-lg bg-[#37B9C5] text-[#072742] font-black text-[10px] uppercase shrink-0 active:scale-95"
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
                        className="px-3 py-2 rounded-lg bg-[#F5D042] text-[#072742] font-black text-[10px] uppercase shrink-0"
                      >
                        ➕ Tlf
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black uppercase text-[#37B9C5]">
                🗓️ Próximos Días ({citasSiguientes.length})
              </span>
            </div>

            {citasSiguientes.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0B3559] border border-[#144673] text-center text-xs text-slate-300">
                No hay citas agendadas para los próximos días.
              </div>
            ) : (
              <div className="space-y-2">
                {citasSiguientes.map((cita) => (
                  <div
                    key={cita.id}
                    className="p-3.5 rounded-xl bg-[#0B3559] border border-[#144673] flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="px-2.5 py-1.5 rounded-lg bg-white text-[#072742] text-center shrink-0">
                        <span className="text-[9px] font-black block">{cita.fecha.slice(5)}</span>
                        <span className="text-xs font-black text-[#C62828]">{cita.hora_inicio.substring(0, 5)}</span>
                      </div>
                      <div>
                        <p className="text-xs font-black text-white leading-tight">
                          {cita.nombre_cliente} <span className="text-[#37B9C5]">({cita.codigo_ticket})</span>
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}{cita.monto}
                        </p>
                      </div>
                    </div>

                    {cita.cliente_telefono ? (
                      <button
                        type="button"
                        onClick={() => procesarNotificacionCitaWA(cita)}
                        className="px-3 py-2 rounded-lg bg-[#C62828] text-white font-black text-[10px] uppercase shrink-0 active:scale-95"
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
                        className="px-3 py-2 rounded-lg bg-[#F5D042] text-[#072742] font-black text-[10px] uppercase shrink-0"
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
        <div className="p-5 rounded-2xl bg-[#0B3559] border border-[#144673] space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-white">Disponibilidad</span>
            <select
              value={diaSeleccionado}
              onChange={(e) => setDiaSeleccionado(Number(e.target.value))}
              className="px-4 py-1.5 text-xs font-black rounded-lg bg-[#F5D042] text-[#072742] uppercase focus:outline-none"
            >
              {diasNombres.map((d, idx) => (
                <option key={idx} value={idx}>{d}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {bloques.map((bloque) => (
              <button
                key={bloque.id}
                type="button"
                onClick={() => toggleBloque(bloque.id, bloque.activo)}
                className={`py-2 px-2 rounded-lg text-[11px] font-black transition-all ${
                  bloque.activo
                    ? 'bg-[#37B9C5] text-[#072742] shadow'
                    : 'bg-[#04182B] text-slate-500 border border-[#143F66] line-through'
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
      <div className="w-full max-w-[430px] rounded-[34px] p-6 shadow-2xl border-2 bg-[#072742] border-[#123D63] text-white">
        {/* Barra superior con botón Volver al Inicio */}
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

        <BarberoContent />
      </div>
    </main>
  );
}
