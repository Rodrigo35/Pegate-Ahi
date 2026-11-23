'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { APP_CONFIG } from '../../lib/config';

interface Silla {
  id: string;
  nombre_silla: string;
  nombre_barbero: string;
  activa: boolean;
}

interface ServicioConfigItem {
  id: string;
  nombre: string;
  precio: number;
  descripcion?: string;
}

interface Turno {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono?: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  silla_id?: string | null;
  nombre_barbero?: string | null;
  barbero_preferido?: string | null;
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
  barbero_preferido?: string | null;
  estado: string;
}

const PIN_BARBERO = process.env.NEXT_PUBLIC_BARBER_PIN || '1234';
const AUTH_SESSION_KEY = 'pegate_ahi_barbero_auth';
const THEME_STORAGE_KEY = 'pegate_ahi_tema';

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
        // Ignorar
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
        <div className="w-16 h-16 rounded-2xl bg-[#2563EB]/15 border border-[#2563EB]/50 text-white flex items-center justify-center text-3xl mx-auto shadow-md">
          🔐
        </div>
        <h1 className="text-2xl font-black mt-3">Acceso Barbero</h1>
        <p className="text-xs font-semibold text-slate-400 mt-1">
          Ingresa el PIN de seguridad para gestionar las sillas y citas
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
                  ? 'bg-[#2563EB] border-[#2563EB] scale-110'
                  : isDark
                  ? 'border-slate-700 bg-slate-950'
                  : 'border-slate-300 bg-slate-100'
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
        <p className="text-xs text-slate-500">PIN de {PIN_BARBERO.length} dígitos</p>
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
                ? 'bg-slate-900/90 border-slate-800 text-white hover:border-[#2563EB]'
                : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-[#2563EB]'
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
              ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              : 'bg-slate-100 border-slate-200 text-slate-500'
          }`}
        >
          Limpiar
        </button>

        <button
          type="button"
          onClick={() => agregarDigito('0')}
          className={`h-14 rounded-2xl border text-xl font-black transition-all active:scale-95 ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 text-white hover:border-[#2563EB]'
              : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-[#2563EB]'
          }`}
        >
          0
        </button>

        <button
          type="button"
          onClick={borrarDigito}
          className={`h-14 rounded-2xl border text-base font-black transition-all active:scale-95 ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-[#DC2626] hover:border-[#DC2626]'
              : 'bg-slate-100 border-slate-200 text-[#DC2626]'
          }`}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

function BarberoContent({ isDark }: { isDark: boolean }) {
  const [sillas, setSillas] = useState<Silla[]>([]);
  const [nuevaSillaNombre, setNuevaSillaNombre] = useState<string>('');
  const [nuevoBarberoNombre, setNuevoBarberoNombre] = useState<string>('');
  const [guardandoSilla, setGuardandoSilla] = useState<boolean>(false);

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [turnosFinalizados, setTurnosFinalizados] = useState<Turno[]>([]);
  const [citasDelDia, setCitasDelDia] = useState<Cita[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [horaActual, setHoraActual] = useState<string>('');
  const [hoyStr, setHoyStr] = useState<string>('');
  const [ahoraMs, setAhoraMs] = useState<number>(Date.now());

  const [tabActiva, setTabActiva] = useState<
    'silla' | 'sillas' | 'servicios' | 'citas' | 'qr' | 'horarios'
  >('silla');
  const [clienteUrl, setClienteUrl] = useState<string>('');
  const [copiadoUrl, setCopiadoUrl] = useState<boolean>(false);

  const [diaSeleccionado, setDiaSeleccionado] = useState<number>(1);
  const [bloques, setBloques] = useState<any[]>([]);
  const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Gestión de servicios
  const [serviciosLista, setServiciosLista] = useState<ServicioConfigItem[]>(
    APP_CONFIG.servicios.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      precio: s.precio,
      descripcion: '',
    }))
  );
  const [nuevoSrvNombre, setNuevoSrvNombre] = useState<string>('');
  const [nuevoSrvPrecio, setNuevoSrvPrecio] = useState<string>('');
  const [nuevoSrvDesc, setNuevoSrvDesc] = useState<string>('');
  const [guardandoTarifas, setGuardandoTarifas] = useState<boolean>(false);
  const [tarifasGuardadasOk, setTarifasGuardadasOk] = useState<boolean>(false);

  const [tipoServicio, setTipoServicio] = useState<string>('Corte clásico');
  const [precioServicio, setPrecioServicio] = useState<number>(10);
  const [editandoTurnoId, setEditandoTurnoId] = useState<string | null>(null);

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
      setAhoraMs(ahora.getTime());
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchSillas = async () => {
    const { data } = await supabase
      .from('sillas')
      .select('*')
      .order('creado_en', { ascending: true });
    if (data) setSillas(data as Silla[]);
  };

  const cargarServiciosConfig = async () => {
    const { data } = await supabase
      .from('servicios_config')
      .select('*')
      .order('id', { ascending: true });

    if (data && data.length > 0) {
      const mapeados: ServicioConfigItem[] = data.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        precio: Number(s.precio),
        descripcion: s.descripcion || '',
      }));
      setServiciosLista(mapeados);

      const servicioActual = mapeados.find((s) => s.nombre === tipoServicio) || mapeados[0];
      if (servicioActual) {
        setTipoServicio(servicioActual.nombre);
        setPrecioServicio(servicioActual.precio);
      }
    }
  };

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
    fetchSillas();
    cargarServiciosConfig();
    fetchTurnosYCitas();

    const channelSillas = supabase
      .channel('barbero_sillas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sillas' }, () => {
        fetchSillas();
      })
      .subscribe();

    const channelServicios = supabase
      .channel('barbero_servicios_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicios_config' }, () => {
        cargarServiciosConfig();
      })
      .subscribe();

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
      supabase.removeChannel(channelSillas);
      supabase.removeChannel(channelServicios);
      supabase.removeChannel(channelTurnos);
      supabase.removeChannel(channelCitas);
    };
  }, []);

  const actualizarCampoServicio = (
    id: string,
    campo: 'nombre' | 'precio' | 'descripcion',
    valor: string
  ) => {
    setServiciosLista((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              [campo]: campo === 'precio' ? parseFloat(valor) || 0 : valor,
            }
          : s
      )
    );
  };

  const guardarTodasLasTarifas = async () => {
    setGuardandoTarifas(true);
    for (const srv of serviciosLista) {
      if (!srv.nombre.trim()) continue;
      await supabase
        .from('servicios_config')
        .update({
          nombre: srv.nombre.trim(),
          precio: srv.precio,
          descripcion: srv.descripcion?.trim() || null,
        })
        .eq('id', srv.id);
    }
    await cargarServiciosConfig();
    setGuardandoTarifas(false);
    setTarifasGuardadasOk(true);
    setTimeout(() => setTarifasGuardadasOk(false), 2500);
  };

  const agregarNuevoServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoSrvNombre.trim() || !nuevoSrvPrecio) return;

    const slugId =
      nuevoSrvNombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') +
      '_' +
      Math.floor(Math.random() * 900 + 100);

    const { error } = await supabase.from('servicios_config').insert([
      {
        id: slugId,
        nombre: nuevoSrvNombre.trim(),
        precio: parseFloat(nuevoSrvPrecio) || 0,
        descripcion: nuevoSrvDesc.trim() || null,
      },
    ]);

    if (!error) {
      setNuevoSrvNombre('');
      setNuevoSrvPrecio('');
      setNuevoSrvDesc('');
      cargarServiciosConfig();
    }
  };

  const eliminarServicio = async (id: string, nombre: string) => {
    if (serviciosLista.length <= 1) {
      alert('Debe quedar al menos un servicio activo.');
      return;
    }
    const confirmar = confirm(`¿Eliminar el servicio "${nombre}"?`);
    if (!confirmar) return;

    await supabase.from('servicios_config').delete().eq('id', id);
    cargarServiciosConfig();
  };

  const agregarSilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoBarberoNombre.trim()) return;

    setGuardandoSilla(true);
    const etiquetaSilla = nuevaSillaNombre.trim() || `Silla ${sillas.length + 1}`;

    await supabase.from('sillas').insert([
      {
        nombre_silla: etiquetaSilla,
        nombre_barbero: nuevoBarberoNombre.trim(),
        activa: true,
      },
    ]);

    setNuevaSillaNombre('');
    setNuevoBarberoNombre('');
    await fetchSillas();
    setGuardandoSilla(false);
  };

  const toggleSillaActiva = async (silla: Silla) => {
    const ocupada = turnosEnAtencion.some((t) => t.silla_id === silla.id);
    if (silla.activa && ocupada) {
      alert('Finaliza el corte actual de esta silla antes de pausarla.');
      return;
    }
    await supabase
      .from('sillas')
      .update({ activa: !silla.activa })
      .eq('id', silla.id);
    fetchSillas();
  };

  const eliminarSilla = async (id: string) => {
    if (sillas.length <= 1) {
      alert('Debe existir al menos una silla configurada.');
      return;
    }
    const ocupada = turnosEnAtencion.some((t) => t.silla_id === id);
    if (ocupada) {
      alert('No puedes eliminar una silla mientras atiende a un cliente.');
      return;
    }
    const ok = confirm('¿Eliminar esta silla?');
    if (!ok) return;
    await supabase.from('sillas').delete().eq('id', id);
    fetchSillas();
  };

  const citasDeHoy = hoyStr ? citasDelDia.filter((c) => c.fecha === hoyStr) : [];
  const citasSiguientes = hoyStr ? citasDelDia.filter((c) => c.fecha > hoyStr) : citasDelDia;

  const sillasActivas = sillas.filter((s) => s.activa);
  const turnosEnAtencion = turnos.filter((t) => t.estado === 'atendiendo');
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

  const enviarWhatsAppTurno = (
    telefono: string,
    nombre: string,
    ticket: string,
    etiquetaSilla?: string | null
  ) => {
    let numLimpio = telefono.replace(/\D/g, '');
    if (numLimpio.startsWith('0')) numLimpio = '58' + numLimpio.substring(1);
    const destino = etiquetaSilla ? ` en ${etiquetaSilla}` : '';
    const mensaje = encodeURIComponent(
      `¡Hola ${nombre}! ✂️ Tu turno ${ticket} ha sido llamado${destino} en ${APP_CONFIG.nombreNegocio}. Dispones de ${APP_CONFIG.tiempoLimiteDiligenciaMin} minutos para llegar al local.`
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
          barbero_preferido: cita.barbero_preferido || null,
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

  const handleTipoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const seleccionado = e.target.value;
    setNuevoTipoInput(seleccionado);

    const servicioEncontrado = serviciosLista.find((s) => s.nombre === seleccionado);
    if (servicioEncontrado) {
      setNuevoPrecioInput(servicioEncontrado.precio.toString());
    }
  };

  const guardarNuevoServicio = async (turnoId: string) => {
    const valorPrecio = parseFloat(nuevoPrecioInput);
    if (isNaN(valorPrecio) || valorPrecio < 0) return;

    const servicioEncontrado = serviciosLista.find((s) => s.nombre === nuevoTipoInput);
    if (servicioEncontrado) {
      await supabase
        .from('servicios_config')
        .update({ precio: valorPrecio })
        .eq('id', servicioEncontrado.id);
    }

    await supabase
      .from('turnos')
      .update({
        tipo_corte: nuevoTipoInput,
        monto: valorPrecio,
      })
      .eq('id', turnoId);

    await fetchTurnosYCitas();
    await cargarServiciosConfig();
    setTipoServicio(nuevoTipoInput);
    setPrecioServicio(valorPrecio);
    setEditandoTurnoId(null);
  };

  // Llamar siguiente cliente a una silla específica
  const llamarSiguienteParaSilla = async (silla: Silla) => {
    if (colaEspera.length === 0) return;

    const clienteEnLocal = colaEspera.find((t) => t.modalidad_espera === 'local');
    const siguiente = clienteEnLocal || colaEspera[0];
    const etiquetaAsignada = `${silla.nombre_silla} · ${silla.nombre_barbero}`;

    await supabase
      .from('turnos')
      .update({
        estado: 'atendiendo',
        silla_id: silla.id,
        nombre_barbero: etiquetaAsignada,
        llamado_en: new Date().toISOString(),
      })
      .eq('id', siguiente.id);

    if (siguiente.cliente_telefono && siguiente.modalidad_espera === 'diligencia') {
      enviarWhatsAppTurno(
        siguiente.cliente_telefono,
        siguiente.nombre_cliente,
        siguiente.codigo_ticket,
        etiquetaAsignada
      );
    }

    fetchTurnosYCitas();
  };

  const confirmarLlegadaCliente = async (turnoId: string) => {
    await supabase
      .from('turnos')
      .update({ modalidad_espera: 'local', llamado_en: null })
      .eq('id', turnoId);
    fetchTurnosYCitas();
  };

  const pasarSiguientePorAusencia = async (turnoAusente: Turno, silla?: Silla) => {
    await supabase
      .from('turnos')
      .update({
        estado: 'espera',
        silla_id: null,
        nombre_barbero: null,
        llamado_en: null,
        creado_en: new Date().toISOString(),
      })
      .eq('id', turnoAusente.id);

    const colaRestante = turnos.filter(
      (t) => t.estado === 'espera' && t.id !== turnoAusente.id
    );

    if (colaRestante.length > 0) {
      const clienteEnLocal = colaRestante.find((t) => t.modalidad_espera === 'local');
      const siguiente = clienteEnLocal || colaRestante[0];
      const etiquetaAsignada = silla
        ? `${silla.nombre_silla} · ${silla.nombre_barbero}`
        : turnoAusente.nombre_barbero || null;

      await supabase
        .from('turnos')
        .update({
          estado: 'atendiendo',
          silla_id: silla?.id || turnoAusente.silla_id || null,
          nombre_barbero: etiquetaAsignada,
          llamado_en: new Date().toISOString(),
        })
        .eq('id', siguiente.id);

      if (siguiente.cliente_telefono && siguiente.modalidad_espera === 'diligencia') {
        enviarWhatsAppTurno(
          siguiente.cliente_telefono,
          siguiente.nombre_cliente,
          siguiente.codigo_ticket,
          etiquetaAsignada
        );
      }
    }

    await fetchTurnosYCitas();
  };

  // Finalizar corte de un cliente específico
  const finalizarServicio = async (turno: Turno) => {
    await supabase
      .from('turnos')
      .update({
        estado: 'finalizado',
        finalizado_en: new Date().toISOString(),
        monto: turno.monto || precioServicio,
        tipo_corte: turno.tipo_corte || tipoServicio,
      })
      .eq('id', turno.id);

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
    ? 'bg-slate-900/90 border-slate-800 text-slate-100'
    : 'bg-slate-50 border-slate-200 text-slate-900';

  const turnosSinSilla = turnosEnAtencion.filter(
    (t) => !t.silla_id || !sillasActivas.some((s) => s.id === t.silla_id)
  );

  return (
    <div className="space-y-4">
      {/* Perfil + indicadores globales */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#2563EB]/15 border border-[#2563EB]/50 text-white flex items-center justify-center text-2xl shrink-0">
            💈
          </div>
          <div>
            <h1 className="text-lg font-black leading-tight">
              {APP_CONFIG.nombreNegocio || 'Panel Barbería'}
            </h1>
            <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
              {sillasActivas.length} {sillasActivas.length === 1 ? 'silla activa' : 'sillas activas'} · {horaActual}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-center ${cardSurface}`}>
            <span className="text-[11px] uppercase font-bold text-slate-400 block">Caja</span>
            <span className="text-sm font-black text-[#2563EB]">
              {APP_CONFIG.monedaSimbolo}
              {totalIngresos}
            </span>
          </div>
          <div className={`px-3 py-1.5 rounded-xl border text-center ${cardSurface}`}>
            <span className="text-[11px] uppercase font-bold text-slate-400 block">Cortes</span>
            <span className="text-sm font-black">{totalAtendidos}</span>
          </div>
        </div>
      </div>

      {/* 6 Pestañas en cuadrícula 3x2 amplia y táctil */}
      <div
        className={`grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border ${
          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setTabActiva('silla')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            tabActiva === 'silla'
              ? 'bg-[#DC2626] text-white shadow-sm'
              : isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <span className="text-base leading-none">💈</span>
          <span>Fila ({colaEspera.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('sillas')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            tabActiva === 'sillas'
              ? 'bg-[#2563EB] text-white shadow-sm'
              : isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <span className="text-base leading-none">🪑</span>
          <span>Sillas ({sillasActivas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('servicios')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            tabActiva === 'servicios'
              ? 'bg-[#2563EB] text-white shadow-sm'
              : isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <span className="text-base leading-none">✂️</span>
          <span>Tarifas ({serviciosLista.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('citas')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            tabActiva === 'citas'
              ? 'bg-[#2563EB] text-white shadow-sm'
              : isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <span className="text-base leading-none">📅</span>
          <span>Citas ({citasDelDia.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('qr')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            tabActiva === 'qr'
              ? isDark
                ? 'bg-white text-slate-950 shadow-sm'
                : 'bg-slate-900 text-white shadow-sm'
              : isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <span className="text-base leading-none">📷</span>
          <span>Código QR</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('horarios')}
          className={`py-2.5 px-2 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
            tabActiva === 'horarios'
              ? 'bg-[#1D4ED8] text-white shadow-sm'
              : isDark
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <span className="text-base leading-none">🕒</span>
          <span>Horarios</span>
        </button>
      </div>

      {/* --- TAB 1: FILA DE SILLAS EN ATENCIÓN + COLA COMPARTIDA --- */}
      {tabActiva === 'silla' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Sillas en Atención ({turnosEnAtencion.length}/{sillasActivas.length} ocupadas)
            </span>
            <button
              type="button"
              onClick={() => setTabActiva('sillas')}
              className="text-xs font-black text-[#2563EB] hover:underline"
            >
              + Silla
            </button>
          </div>

          {loading ? (
            <p className="text-center text-sm text-slate-400 py-6 animate-pulse">Cargando...</p>
          ) : (
            <div className="space-y-3">
              {sillasActivas.map((silla) => {
                const turnoEnSilla = turnosEnAtencion.find((t) => t.silla_id === silla.id);
                const minRestantes =
                  turnoEnSilla &&
                  turnoEnSilla.modalidad_espera === 'diligencia' &&
                  turnoEnSilla.llamado_en
                    ? Math.max(
                        0,
                        APP_CONFIG.tiempoLimiteDiligenciaMin -
                          Math.floor(
                            (ahoraMs - new Date(turnoEnSilla.llamado_en).getTime()) / 60000
                          )
                      )
                    : null;

                return (
                  <div
                    key={silla.id}
                    className={`p-4 rounded-2xl border space-y-3 transition-all ${
                      turnoEnSilla
                        ? 'border-[#DC2626]/60'
                        : 'border-[#2563EB]/40'
                    } ${cardSurface}`}
                  >
                    {/* Cabecera de la silla con nombre del barbero */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-[#2563EB] text-white text-[11px] font-black uppercase">
                          {silla.nombre_silla}
                        </span>
                        <span className="text-sm font-black">{silla.nombre_barbero}</span>
                      </div>

                      {turnoEnSilla ? (
                        <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#DC2626]/15 text-[#DC2626] border border-[#DC2626]/30">
                          {turnoEnSilla.modalidad_espera === 'diligencia'
                            ? '🏃‍♂️ En camino'
                            : '✂️ Ocupada'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400">💺 Disponible</span>
                      )}
                    </div>

                    {turnoEnSilla ? (
                      <div className="space-y-3">
                        {turnoEnSilla.cliente_llego && (
                          <div className="p-2.5 rounded-xl bg-[#2563EB] text-white text-center text-xs font-black">
                            📍 ¡El cliente ya llegó al local!
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="px-3 py-2 rounded-xl bg-[#DC2626] text-white text-sm font-black shrink-0">
                              {turnoEnSilla.codigo_ticket}
                            </div>
                            <div>
                              <h3 className="text-base font-black leading-tight">
                                {turnoEnSilla.nombre_cliente}
                              </h3>
                              <p className="text-xs font-semibold text-slate-400">
                                {turnoEnSilla.tipo_corte || tipoServicio}
                              </p>
                            </div>
                          </div>
                          <p className="text-2xl font-black text-[#2563EB]">
                            {APP_CONFIG.monedaSimbolo}
                            {turnoEnSilla.monto || precioServicio}
                          </p>
                        </div>

                        {editandoTurnoId === turnoEnSilla.id ? (
                          <div
                            className={`p-3 rounded-xl border space-y-2.5 ${
                              isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex gap-2">
                              <select
                                value={nuevoTipoInput}
                                onChange={handleTipoChange}
                                className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg border focus:outline-none ${
                                  isDark
                                    ? 'bg-slate-900 border-slate-700 text-white'
                                    : 'bg-slate-50 border-slate-300 text-slate-900'
                                }`}
                              >
                                {serviciosLista.map((srv) => (
                                  <option key={srv.id} value={srv.nombre}>
                                    {srv.nombre}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                step="0.5"
                                value={nuevoPrecioInput}
                                onChange={(e) => setNuevoPrecioInput(e.target.value)}
                                className={`w-20 px-2.5 py-2 text-xs font-bold rounded-lg border focus:outline-none ${
                                  isDark
                                    ? 'bg-slate-900 border-slate-700 text-white'
                                    : 'bg-slate-50 border-slate-300 text-slate-900'
                                }`}
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setEditandoTurnoId(null)}
                                className="flex-1 py-2 rounded-lg text-xs font-bold border border-slate-700 text-slate-400"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => guardarNuevoServicio(turnoEnSilla.id)}
                                className="flex-1 py-2 rounded-lg text-xs font-black bg-[#2563EB] text-white"
                              >
                                Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => {
                                setNuevoTipoInput(turnoEnSilla.tipo_corte || tipoServicio);
                                setNuevoPrecioInput((turnoEnSilla.monto || precioServicio).toString());
                                setEditandoTurnoId(turnoEnSilla.id);
                              }}
                              className="text-xs font-bold text-slate-400 hover:text-[#2563EB]"
                            >
                              ✏️ Cambiar servicio/monto
                            </button>

                            {turnoEnSilla.cliente_telefono && (
                              <button
                                type="button"
                                onClick={() =>
                                  enviarWhatsAppTurno(
                                    turnoEnSilla.cliente_telefono!,
                                    turnoEnSilla.nombre_cliente,
                                    turnoEnSilla.codigo_ticket,
                                    `${silla.nombre_silla} (${silla.nombre_barbero})`
                                  )
                                }
                                className="px-3 py-1 rounded-lg bg-[#2563EB] text-white text-xs font-black"
                              >
                                📲 WhatsApp
                              </button>
                            )}
                          </div>
                        )}

                        {turnoEnSilla.modalidad_espera === 'diligencia' &&
                          minRestantes !== null &&
                          !turnoEnSilla.cliente_llego && (
                            <div
                              className={`p-3 rounded-xl border text-center space-y-2 ${
                                isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
                              }`}
                            >
                              <p className="text-xs font-bold text-slate-400">
                                Tiempo límite:{' '}
                                <span className="text-[#DC2626] font-black">{minRestantes} min</span>
                              </p>
                              <button
                                type="button"
                                onClick={() => confirmarLlegadaCliente(turnoEnSilla.id)}
                                className="w-full py-2.5 rounded-lg bg-[#2563EB] text-white font-black text-xs"
                              >
                                💈 Confirmar Llegada al Local
                              </button>
                            </div>
                          )}

                        {/* Botón individual de Finalizar / Ausente para este cliente */}
                        <div className="flex gap-2 pt-1">
                          {turnoEnSilla.modalidad_espera === 'diligencia' && (
                            <button
                              type="button"
                              onClick={() => pasarSiguientePorAusencia(turnoEnSilla, silla)}
                              className="flex-1 py-3 rounded-xl border border-[#DC2626] text-[#DC2626] font-black text-xs"
                            >
                              Ausente
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => finalizarServicio(turnoEnSilla)}
                            className="flex-1 py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-xs tracking-wide shadow-md active:scale-95"
                          >
                            ✅ Finalizar Corte
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => llamarSiguienteParaSilla(silla)}
                        disabled={colaEspera.length === 0}
                        className="w-full py-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-xs tracking-wide shadow-md active:scale-95 disabled:opacity-40"
                      >
                        📢 Llamar Siguiente a {silla.nombre_silla} ({colaEspera.length})
                      </button>
                    )}
                  </div>
                );
              })}

              {turnosSinSilla.map((t) => (
                <div
                  key={t.id}
                  className={`p-4 rounded-2xl border border-[#DC2626]/40 flex items-center justify-between ${cardSurface}`}
                >
                  <div>
                    <span className="text-xs font-black text-[#DC2626]">{t.codigo_ticket}</span>
                    <p className="text-sm font-black">{t.nombre_cliente}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => finalizarServicio(t)}
                    className="px-4 py-2.5 rounded-xl bg-[#2563EB] text-white text-xs font-black"
                  >
                    ✅ Finalizar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Lista de Espera compartida del día */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-black">Cola de hoy ({colaEspera.length})</span>
              <span className="text-xs font-bold text-slate-400">
                Prom. ~{tiempoPromedioMinutos}m
              </span>
            </div>

            {colaEspera.length === 0 ? (
              <div className={`p-5 rounded-xl border text-center text-sm text-slate-400 ${cardSurface}`}>
                No hay clientes en espera hoy.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5">
                {colaEspera.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between ${cardSurface}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#2563EB]/15 border border-[#2563EB]/40 text-[#2563EB] flex items-center justify-center text-xs font-black shrink-0">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black">{item.nombre_cliente}</span>
                          <span className="text-xs font-black text-[#DC2626]">
                            ({item.codigo_ticket})
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">
                          {item.tipo_corte} ·{' '}
                          {item.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera' : '💈 Local'}
                        </p>
                        {item.barbero_preferido && (
                          <span className="block text-[11px] font-black text-[#2563EB] mt-0.5">
                            💈 Pidió: {item.barbero_preferido}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="text-sm font-black text-[#2563EB]">
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

      {/* --- TAB 2: GESTOR DE SILLAS, BARBEROS Y DESGLOSE DE CAJA --- */}
      {tabActiva === 'sillas' && (
        <div className="space-y-4">
          <form
            onSubmit={agregarSilla}
            className={`p-4 rounded-2xl border space-y-3 ${cardSurface}`}
          >
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block">
              ➕ Agregar Silla / Barbero
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder={`Ej: Silla ${sillas.length + 1}`}
                value={nuevaSillaNombre}
                onChange={(e) => setNuevaSillaNombre(e.target.value)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
              <input
                type="text"
                required
                placeholder="Nombre del barbero *"
                value={nuevoBarberoNombre}
                onChange={(e) => setNuevoBarberoNombre(e.target.value)}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={guardandoSilla || !nuevoBarberoNombre.trim()}
              className="w-full py-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-xs uppercase tracking-wider active:scale-95 disabled:opacity-40"
            >
              {guardandoSilla ? 'Agregando...' : 'Agregar Silla'}
            </button>
          </form>

          <div className="space-y-2.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 px-1 block">
              Sillas y Producción de Hoy ({sillas.length})
            </span>

            {sillas.map((s) => {
              const cortesSilla = turnosFinalizados.filter((t) => t.silla_id === s.id);
              const cajaSilla = cortesSilla.reduce((acc, t) => acc + (t.monto || 0), 0);

              return (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border flex items-center justify-between gap-2 ${cardSurface} ${
                    !s.activa ? 'opacity-60' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#2563EB]/15 text-[#2563EB] text-xs font-black">
                        {s.nombre_silla}
                      </span>
                      <span className="text-sm font-black">{s.nombre_barbero}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-bold">
                      <span className="text-slate-400">
                        {s.activa ? '🟢 Activa' : '🔴 Pausada'}
                      </span>
                      <span className="text-[#2563EB]">
                        {cortesSilla.length} cortes · {APP_CONFIG.monedaSimbolo}
                        {cajaSilla}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleSillaActiva(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all ${
                        s.activa
                          ? 'border-[#2563EB] text-[#2563EB]'
                          : 'bg-[#2563EB] text-white border-[#2563EB]'
                      }`}
                    >
                      {s.activa ? 'Pausar' : 'Activar'}
                    </button>
                    {sillas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => eliminarSilla(s.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-[#DC2626]/40 text-[#DC2626] text-xs font-black"
                        title="Eliminar silla"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- TAB 3: GESTIÓN DE SERVICIOS Y TARIFAS --- */}
      {tabActiva === 'servicios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Tarifas activas
            </span>
            {tarifasGuardadasOk && (
              <span className="text-xs font-black text-emerald-400">✅ Guardado</span>
            )}
          </div>

          <div className="space-y-2.5">
            {serviciosLista.map((srv) => (
              <div
                key={srv.id}
                className={`p-3 rounded-2xl border space-y-2 ${cardSurface}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={srv.nombre}
                    placeholder="Nombre del servicio"
                    onChange={(e) =>
                      actualizarCampoServicio(srv.id, 'nombre', e.target.value)
                    }
                    className={`flex-1 px-3 py-2 rounded-xl border text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-[#2563EB]">
                      {APP_CONFIG.monedaSimbolo}
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      value={srv.precio}
                      onChange={(e) =>
                        actualizarCampoServicio(srv.id, 'precio', e.target.value)
                      }
                      className={`w-full pl-6 pr-2 py-2 rounded-xl border text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarServicio(srv.id, srv.nombre)}
                    title="Eliminar servicio"
                    className="px-2.5 py-2 rounded-xl border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626] hover:text-white text-xs font-black transition-all"
                  >
                    ✕
                  </button>
                </div>

                <input
                  type="text"
                  value={srv.descripcion || ''}
                  placeholder="Descripción breve (opcional)"
                  onChange={(e) =>
                    actualizarCampoServicio(srv.id, 'descripcion', e.target.value)
                  }
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-300 placeholder-slate-600'
                      : 'bg-white border-slate-300 text-slate-700 placeholder-slate-400'
                  }`}
                />
              </div>
            ))}
          </div>

          {serviciosLista.length > 0 && (
            <button
              type="button"
              onClick={guardarTodasLasTarifas}
              disabled={guardandoTarifas}
              className="w-full py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-xs uppercase tracking-wider shadow-md active:scale-95 disabled:opacity-40"
            >
              {guardandoTarifas ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}

          {/* Crear nuevo servicio */}
          <form
            onSubmit={agregarNuevoServicio}
            className={`p-3.5 rounded-2xl border border-dashed space-y-2.5 ${cardSurface}`}
          >
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Nuevo servicio (Ej: Corte + Ozono)"
                value={nuevoSrvNombre}
                onChange={(e) => setNuevoSrvNombre(e.target.value)}
                className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
              <input
                type="number"
                step="0.5"
                required
                placeholder="Precio"
                value={nuevoSrvPrecio}
                onChange={(e) => setNuevoSrvPrecio(e.target.value)}
                className={`w-24 px-3 py-2 rounded-xl border text-xs font-black focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={nuevoSrvDesc}
              onChange={(e) => setNuevoSrvDesc(e.target.value)}
              className={`w-full px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-300 placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-700 placeholder-slate-400'
              }`}
            />
            <button
              type="submit"
              disabled={!nuevoSrvNombre.trim() || !nuevoSrvPrecio}
              className="w-full py-3 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-xs uppercase tracking-wider active:scale-95 disabled:opacity-40"
            >
              + Añadir Servicio
            </button>
          </form>
        </div>
      )}

      {/* --- TAB 4: AGENDA DE CITAS --- */}
      {tabActiva === 'citas' && (
        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-0.5">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-black">📅 Citas de Hoy ({citasDeHoy.length})</span>
              <span className="text-xs text-slate-400">Pasar a cola al llegar</span>
            </div>

            {citasDeHoy.length === 0 ? (
              <div className={`p-4 rounded-xl border text-center text-sm text-slate-400 ${cardSurface}`}>
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
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">
                          {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}
                          {cita.monto}
                        </p>
                        {cita.barbero_preferido && (
                          <span className="block text-[11px] font-black text-[#2563EB] mt-0.5">
                            💈 Pidió: {cita.barbero_preferido}
                          </span>
                        )}
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
              <div className={`p-4 rounded-xl border text-center text-sm text-slate-400 ${cardSurface}`}>
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
                      <div className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-center shrink-0">
                        <span className="text-[11px] font-bold text-slate-400 block">
                          {cita.fecha.slice(5)}
                        </span>
                        <span className="text-sm font-black text-[#2563EB]">
                          {cita.hora_inicio.substring(0, 5)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-black leading-tight">
                          {cita.nombre_cliente}{' '}
                          <span className="text-[#2563EB]">({cita.codigo_ticket})</span>
                        </p>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">
                          {cita.tipo_corte} · {APP_CONFIG.monedaSimbolo}
                          {cita.monto}
                        </p>
                        {cita.barbero_preferido && (
                          <span className="block text-[11px] font-black text-[#2563EB] mt-0.5">
                            💈 Pidió: {cita.barbero_preferido}
                          </span>
                        )}
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

      {/* --- TAB 5: QR DEL DÍA --- */}
      {tabActiva === 'qr' && (
        <div className={`p-6 rounded-2xl border text-center space-y-4 ${cardSurface}`}>
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-[#2563EB]/15 text-[#2563EB] border border-[#2563EB]/30 text-xs font-extrabold uppercase tracking-wider">
              Registro Rápido en Local
            </span>
            <h3 className="text-lg font-black mt-2">Escanea para tomar tu turno hoy</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              El cliente entra directo a la cola del día y sigue su turno en vivo desde su teléfono.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border-2 border-[#2563EB] inline-block mx-auto">
            {qrImageUrl ? (
              <img src={qrImageUrl} alt="QR Cola Barbería" className="w-48 h-48 rounded-lg" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-sm text-slate-400">
                Generando QR...
              </div>
            )}
          </div>

          <div
            className={`p-3 rounded-lg border text-xs font-mono truncate ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-400'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            {clienteUrl}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={copiarEnlaceCliente}
              className="flex-1 py-3.5 rounded-xl bg-[#2563EB] text-white font-black text-xs active:scale-95"
            >
              {copiadoUrl ? '✅ Copiado' : '📋 Copiar Enlace'}
            </button>
            <button
              type="button"
              onClick={() => setTabActiva('silla')}
              className="flex-1 py-3.5 rounded-xl bg-[#DC2626] text-white font-black text-xs active:scale-95"
            >
              Volver a Fila
            </button>
          </div>
        </div>
      )}

      {/* --- TAB 6: GESTOR DE HORARIOS --- */}
      {tabActiva === 'horarios' && (
        <div className={`p-5 rounded-2xl border space-y-4 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-black">Horarios disponibles</span>
            <select
              value={diaSeleccionado}
              onChange={(e) => setDiaSeleccionado(Number(e.target.value))}
              className="px-4 py-2 text-sm font-black rounded-xl bg-slate-950 border border-[#2563EB]/60 text-white focus:outline-none"
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
                      ? 'bg-slate-950 border-[#2563EB] text-white'
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
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const [esNoche, setEsNoche] = useState<boolean>(false);
  const [autorizado, setAutorizado] = useState<boolean>(false);
  const [verificandoSesion, setVerificandoSesion] = useState<boolean>(true);

  const cambiarTema = (nuevoModo: 'auto' | 'light' | 'dark') => {
    setModoTema(nuevoModo);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nuevoModo);
    } catch {
      // Ignorar
    }
  };

  const bloquearPanel = () => {
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch {
      // Ignorar
    }
    setAutorizado(false);
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
    const intervalHora = setInterval(verificarHora, 60000);

    try {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const esRecarga = navEntries.length > 0 && navEntries[0].type === 'reload';
      const sesion = sessionStorage.getItem(AUTH_SESSION_KEY);

      if (esRecarga && sesion === 'true') {
        setAutorizado(true);
      } else {
        sessionStorage.removeItem(AUTH_SESSION_KEY);
        setAutorizado(false);
      }
    } catch {
      setAutorizado(false);
    }
    setVerificandoSesion(false);

    const handlePopState = () => {
      if (window.location.pathname !== '/barbero') {
        try {
          sessionStorage.removeItem(AUTH_SESSION_KEY);
        } catch {
          // Ignorar
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      clearInterval(intervalHora);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 ${
        isDark ? 'bg-[#080D1A] text-white' : 'bg-[#F1F5F9] text-slate-900'
      }`}
    >
      <div
        className={`w-full max-w-[460px] rounded-3xl p-3 sm:p-4 shadow-2xl border transition-colors ${
          isDark ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="rounded-2xl border-2 border-[#2563EB]/60 p-5 sm:p-6">
          <div
            className={`flex items-center justify-between pb-3 mb-4 border-b ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Link
                href="/"
                onClick={bloquearPanel}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all ${
                  isDark
                    ? 'bg-slate-900 text-white border border-slate-800 hover:border-[#2563EB]'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
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

          {verificandoSesion ? (
            <p className="text-center text-sm text-slate-400 py-10">Verificando acceso...</p>
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
