'use client';

import { useState, useEffect } from 'react';
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

function BarberoContent({ isDark }: { isDark: boolean }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [turnosFinalizados, setTurnosFinalizados] = useState<Turno[]>([]);
  const [citasDelDia, setCitasDelDia] = useState<Cita[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [horaActual, setHoraActual] = useState<string>('');
  const [minutosRestantes, setMinutosRestantes] = useState<number | null>(null);

  const [tabActiva, setTabActiva] = useState<'silla' | 'citas' | 'horarios'>('silla');

  const [diaSeleccionado, setDiaSeleccionado] = useState<number>(1);
  const [bloques, setBloques] = useState<any[]>([]);
  const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const [tipoServicio, setTipoServicio] = useState<string>('Corte clásico');
  const [precioServicio, setPrecioServicio] = useState<number>(10);
  const [editandoServicio, setEditandoServicio] = useState<boolean>(false);

  const [nuevoTipoInput, setNuevoTipoInput] = useState<string>('Corte clásico');
  const [nuevoPrecioInput, setNuevoPrecioInput] = useState<string>('10');

  useEffect(() => {
    const hoy = new Date().getDay();
    setDiaSeleccionado(hoy === 0 ? 0 : hoy);

    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
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

    const hoyStr = getFechaLocalStr();
    const esHoy = cita.fecha === hoyStr;
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

  const cardSurface = isDark
    ? 'bg-[#1D2229] border-[#2E353F] text-[#F4F3F1]'
    : 'bg-white border-[#E5E2DC] text-[#232931] shadow-[0_4px_20px_-4px_rgba(35,41,49,0.06)]';

  return (
    <div className="space-y-4">
      {/* Saludo y estado en línea */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-extrabold leading-tight">Panel Barbero</p>
          <p className="text-xs font-bold text-[#C47E52] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            En línea · {horaActual}
          </p>
        </div>

        {/* Métricas rápidas */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-2xl border text-center ${cardSurface}`}>
            <span className="text-[9px] uppercase font-bold text-[#8C8881] block">Caja</span>
            <span className="text-xs font-black text-[#C47E52]">{APP_CONFIG.monedaSimbolo}{totalIngresos}</span>
          </div>
          <div className={`px-3 py-1.5 rounded-2xl border text-center ${cardSurface}`}>
            <span className="text-[9px] uppercase font-bold text-[#8C8881] block">Cortes</span>
            <span className="text-xs font-black">{totalAtendidos}</span>
          </div>
        </div>
      </div>

      {/* Píldoras de Navegación (Estilo "All | Services | Price" de la imagen) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setTabActiva('silla')}
          className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            tabActiva === 'silla'
              ? 'bg-[#232931] text-white shadow-xs'
              : isDark
              ? 'bg-[#1D2229] text-[#8C8881]'
              : 'bg-white text-[#5C636E] border border-[#E5E2DC]'
          }`}
        >
          Silla & Cola ({colaEspera.length})
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('citas')}
          className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            tabActiva === 'citas'
              ? 'bg-[#232931] text-white shadow-xs'
              : isDark
              ? 'bg-[#1D2229] text-[#8C8881]'
              : 'bg-white text-[#5C636E] border border-[#E5E2DC]'
          }`}
        >
          Agenda ({citasDelDia.length})
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('horarios')}
          className={`px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            tabActiva === 'horarios'
              ? 'bg-[#232931] text-white shadow-xs'
              : isDark
              ? 'bg-[#1D2229] text-[#8C8881]'
              : 'bg-white text-[#5C636E] border border-[#E5E2DC]'
          }`}
        >
          Horarios
        </button>
      </div>

      {/* --- TAB 1: SILLA & COLA EN VIVO --- */}
      {tabActiva === 'silla' && (
        <div className="space-y-4">
          {/* Tarjeta Cliente en Silla (Estilo Barber Card con precio grande a la derecha) */}
          <div className={`p-5 rounded-3xl border space-y-4 ${cardSurface}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C8881]">
                En Silla Ahora
              </span>
              {turnoActual && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#C47E52]/15 text-[#C47E52]">
                  {turnoActual.modalidad_espera === 'diligencia' ? '🏃‍♂️ En camino' : '✂️ Atendiendo'}
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-center text-xs text-[#8C8881] py-6 animate-pulse">Cargando...</p>
            ) : turnoActual ? (
              <div className="space-y-4">
                {turnoActual.cliente_llego && (
                  <div className="p-2.5 rounded-2xl bg-[#C47E52]/20 border border-[#C47E52] text-center text-[11px] font-bold text-[#C47E52]">
                    📍 ¡El cliente ya llegó al local!
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#C47E52]/20 flex items-center justify-center text-xl font-black text-[#C47E52] shrink-0">
                      {turnoActual.codigo_ticket}
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold leading-tight">{turnoActual.nombre_cliente}</h3>
                      <p className="text-xs text-[#8C8881]">{turnoActual.tipo_corte || tipoServicio}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#C47E52]">
                      {APP_CONFIG.monedaSimbolo}{turnoActual.monto || precioServicio}
                    </p>
                  </div>
                </div>

                {/* Edición rápida de servicio/tarifa */}
                {editandoServicio ? (
                  <div className={`p-3 rounded-2xl space-y-2.5 ${isDark ? 'bg-[#15191E]' : 'bg-[#F4F3F1]'}`}>
                    <div className="flex gap-2">
                      <select
                        value={nuevoTipoInput}
                        onChange={handleTipoChange}
                        className={`flex-1 px-3 py-2 text-xs font-bold rounded-xl border focus:outline-none ${
                          isDark ? 'bg-[#1D2229] border-[#2E353F]' : 'bg-white border-[#E5E2DC]'
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
                        className={`w-20 px-3 py-2 text-xs font-bold rounded-xl border focus:outline-none ${
                          isDark ? 'bg-[#1D2229] border-[#2E353F]' : 'bg-white border-[#E5E2DC]'
                        }`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditandoServicio(false)}
                        className="flex-1 py-2 rounded-full text-xs font-bold border border-current/15"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={guardarNuevoServicio}
                        className="flex-1 py-2 rounded-full text-xs font-bold bg-[#C47E52] text-white"
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
                      className="text-[11px] font-bold text-[#8C8881] hover:text-[#C47E52]"
                    >
                      ✏️ Cambiar servicio/monto
                    </button>

                    {turnoActual.cliente_telefono && (
                      <button
                        type="button"
                        onClick={() => enviarWhatsAppTurno(turnoActual.cliente_telefono!, turnoActual.nombre_cliente, turnoActual.codigo_ticket)}
                        className="px-3 py-1 rounded-full bg-emerald-600/15 text-emerald-500 text-[11px] font-bold"
                      >
                        📲 WhatsApp
                      </button>
                    )}
                  </div>
                )}

                {turnoActual.modalidad_espera === 'diligencia' && minutosRestantes !== null && !turnoActual.cliente_llego && (
                  <div className={`p-3.5 rounded-2xl text-center space-y-2 ${isDark ? 'bg-[#15191E]' : 'bg-[#F4F3F1]'}`}>
                    <p className="text-[11px] font-bold text-[#8C8881]">
                      Tiempo límite: <span className="text-[#C47E52] font-black">{minutosRestantes} min</span>
                    </p>
                    <button
                      type="button"
                      onClick={confirmarLlegadaCliente}
                      className="w-full py-2.5 rounded-full bg-[#232931] text-white font-bold text-xs"
                    >
                      💈 Confirmar Llegada al Local
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center space-y-1">
                <span className="text-3xl block">💺</span>
                <p className="text-xs font-bold">Silla disponible</p>
                <p className="text-[11px] text-[#8C8881]">Llama al siguiente cliente de la cola</p>
              </div>
            )}

            {/* Botones principales de acción */}
            <div className="pt-1">
              {!turnoActual ? (
                <button
                  onClick={llamarSiguiente}
                  disabled={colaEspera.length === 0}
                  className={`w-full py-3.5 rounded-full font-bold text-xs tracking-wide transition-all shadow-md active:scale-95 disabled:opacity-40 ${
                    isDark ? 'bg-[#C47E52] text-white' : 'bg-[#232931] text-white'
                  }`}
                >
                  📢 Llamar Siguiente ({colaEspera.length})
                </button>
              ) : (
                <div className="flex gap-2">
                  {turnoActual.modalidad_espera === 'diligencia' && (
                    <button
                      onClick={pasarSiguientePorAusencia}
                      className="flex-1 py-3.5 rounded-full border border-rose-500/40 text-rose-500 font-bold text-xs"
                    >
                      Ausente
                    </button>
                  )}
                  <button
                    onClick={finalizarServicio}
                    className="flex-1 py-3.5 rounded-full bg-[#C47E52] hover:bg-[#B36E43] text-white font-bold text-xs shadow-md active:scale-95"
                  >
                    ✅ Finalizar Corte
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Espera estilo tarjetas de Barberos de la referencia */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold">Próximos en cola ({colaEspera.length})</span>
              <span className="text-[11px] text-[#8C8881]">Prom. ~{tiempoPromedioMinutos}m</span>
            </div>

            {colaEspera.length === 0 ? (
              <div className={`p-5 rounded-2xl border text-center text-xs text-[#8C8881] ${cardSurface}`}>
                No hay clientes esperando en este momento.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-0.5">
                {colaEspera.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${cardSurface}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#C47E52]/15 text-[#C47E52] flex items-center justify-center text-xs font-black shrink-0">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold">{item.nombre_cliente}</span>
                          <span className="text-[10px] font-bold text-[#C47E52]">({item.codigo_ticket})</span>
                        </div>
                        <p className="text-[11px] text-[#8C8881]">
                          {item.tipo_corte} · {item.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera' : '💈 Local'}
                        </p>
                      </div>
                    </div>

                    <span className="text-sm font-black">
                      {APP_CONFIG.monedaSimbolo}{item.monto || precioServicio}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: AGENDA DE CITAS --- */}
      {tabActiva === 'citas' && (
        <div className="space-y-3">
          <p className="text-xs font-bold px-1">Citas Agendadas ({citasDelDia.length})</p>
          {citasDelDia.length === 0 ? (
            <div className={`p-8 rounded-3xl border text-center text-xs text-[#8C8881] ${cardSurface}`}>
              No hay citas agendadas pendientes.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-0.5">
              {citasDelDia.map((cita) => (
                <div
                  key={cita.id}
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-2 ${cardSurface}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="px-2.5 py-1.5 rounded-xl bg-[#C47E52]/15 text-center shrink-0">
                      <span className="text-[9px] font-bold text-[#8C8881] block">{cita.fecha.slice(5)}</span>
                      <span className="text-xs font-black text-[#C47E52]">{cita.hora_inicio.substring(0, 5)}</span>
                    </div>
                    <div>
                      <p className="text-xs font-extrabold leading-tight">
                        {cita.nombre_cliente} <span className="text-[#C47E52]">({cita.codigo_ticket})</span>
                      </p>
                      <p className="text-[11px] text-[#8C8881] mt-0.5">
                        {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}{cita.monto}
                      </p>
                    </div>
                  </div>

                  {cita.cliente_telefono ? (
                    <button
                      type="button"
                      onClick={() => procesarNotificacionCitaWA(cita)}
                      className="px-3.5 py-2 rounded-full bg-[#232931] hover:bg-[#191E24] text-white font-bold text-[11px] shrink-0 active:scale-95"
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
                      className="px-3 py-2 rounded-full bg-[#C47E52] text-white font-bold text-[11px] shrink-0"
                    >
                      ➕ Tlf
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: GESTOR DE HORARIOS --- */}
      {tabActiva === 'horarios' && (
        <div className={`p-5 rounded-3xl border space-y-4 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">Disponibilidad</span>
            <select
              value={diaSeleccionado}
              onChange={(e) => setDiaSeleccionado(Number(e.target.value))}
              className={`px-3 py-1.5 text-xs font-bold rounded-full border focus:outline-none ${
                isDark ? 'bg-[#15191E] border-[#2E353F] text-[#C47E52]' : 'bg-[#F4F3F1] border-[#E5E2DC] text-[#232931]'
              }`}
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
                className={`py-2 px-2 rounded-full text-[11px] font-bold border transition-all ${
                  bloque.activo
                    ? 'bg-[#232931] text-white border-[#232931] shadow-xs'
                    : isDark
                    ? 'bg-[#15191E] text-[#5C636E] border-[#2E353F] line-through'
                    : 'bg-[#F4F3F1] text-[#9CA3AF] border-[#E5E2DC] line-through'
                }`}
              >
                🕒 {bloque.hora_inicio.substring(0, 5)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BarberoView() {
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
      <div
        className={`w-full max-w-[430px] rounded-[36px] p-6 shadow-2xl border transition-colors duration-500 ${
          isDark
            ? 'bg-[#15191E] border-[#262C35]'
            : 'bg-[#F4F3F1] border-white/60'
        }`}
      >
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#C47E52] text-white flex items-center justify-center text-sm font-black shadow-xs">
              💈
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight uppercase leading-none">
                {APP_CONFIG.nombreNegocio}
              </h1>
              <p className="text-[10px] text-[#8C8881] font-medium mt-0.5">
                Control de Barbería
              </p>
            </div>
          </div>

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
            >
              ☀️
            </button>
            <button
              onClick={() => setModoTema('dark')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#C47E52] text-white' : 'text-[#8C8881]'
              }`}
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

        <BarberoContent isDark={isDark} />
      </div>
    </main>
  );
}
