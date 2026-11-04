'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

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

function BarberoContent({ isDark }: { isDark: boolean }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [turnosFinalizados, setTurnosFinalizados] = useState<Turno[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [horaActual, setHoraActual] = useState<string>('');
  const [minutosRestantes, setMinutosRestantes] = useState<number | null>(null);

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchTurnos = async () => {
    const { data: activos, error: errorActivos } = await supabase
      .from('turnos')
      .select('*')
      .in('estado', ['espera', 'atendiendo'])
      .order('creado_en', { ascending: true });

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data: finalizados, error: errorFinalizados } = await supabase
      .from('turnos')
      .select('*')
      .eq('estado', 'finalizado')
      .gte('creado_en', inicioHoy.toISOString())
      .order('creado_en', { ascending: false });

    if (!errorActivos && activos) setTurnos(activos as Turno[]);
    if (!errorFinalizados && finalizados) setTurnosFinalizados(finalizados as Turno[]);

    setLoading(false);
  };

  useEffect(() => {
    fetchTurnos();
    const channel = supabase
      .channel('barbero_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        fetchTurnos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const turnoActual = turnos.find((t) => t.estado === 'atendiendo');
  const colaEspera = turnos.filter((t) => t.estado === 'espera');

  // CÁLCULOS DEL DASHBOARD DE NEGOCIO
  const totalIngresos = turnosFinalizados.reduce((acc, t) => acc + (t.monto || 0), 0);
  const totalAtendidos = turnosFinalizados.length;

  const tiempoPromedioMinutos = (() => {
    const serviciosConTiempo = turnosFinalizados.filter((t) => t.llamado_en && t.finalizado_en);
    if (serviciosConTiempo.length === 0) return 15;
    const totalMinutos = serviciosConTiempo.reduce((acc, t) => {
      const inicio = new Date(t.llamado_en!).getTime();
      const fin = new Date(t.finalizado_en!).getTime();
      return acc + (fin - inicio) / 60000;
    }, 0);
    return Math.round(totalMinutos / serviciosConTiempo.length);
  })();

  // Temporizador de 30 minutos para clientes en diligencia
  useEffect(() => {
    if (turnoActual && turnoActual.modalidad_espera === 'diligencia' && turnoActual.llamado_en) {
      const interval = setInterval(() => {
        const horaLlamado = new Date(turnoActual.llamado_en!).getTime();
        const ahora = new Date().getTime();
        const transcurridoMin = Math.floor((ahora - horaLlamado) / 60000);
        const restante = 30 - transcurridoMin;
        setMinutosRestantes(restante > 0 ? restante : 0);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setMinutosRestantes(null);
    }
  }, [turnoActual]);

  const enviarWhatsApp = (telefono: string, nombre: string, ticket: string) => {
    let numLimpio = telefono.replace(/\D/g, '');
    if (numLimpio.startsWith('0')) numLimpio = '58' + numLimpio.substring(1);
    const mensaje = encodeURIComponent(
      `¡Hola ${nombre}! ✂️ Tu turno ${ticket} ha sido llamado en Pégate Ahí. Dispones de 30 minutos para llegar al local.`
    );
    window.open(`https://wa.me/${numLimpio}?text=${mensaje}`, '_blank');
  };

  // LLAMAR SIGUIENTE DANDO PRIORIDAD A LOS CLIENTES EN SALA DE ESPERA
  const llamarSiguiente = async () => {
    if (colaEspera.length === 0) return;

    // Buscar primero a quien está presente en el local
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
      enviarWhatsApp(siguiente.cliente_telefono, siguiente.nombre_cliente, siguiente.codigo_ticket);
    }

    fetchTurnos();
  };

  const confirmarLlegadaCliente = async () => {
    if (!turnoActual) return;
    await supabase.from('turnos').update({ modalidad_espera: 'local', llamado_en: null }).eq('id', turnoActual.id);
    fetchTurnos();
  };

  const pasarSiguientePorAusencia = async () => {
    if (!turnoActual) return;
    await supabase.from('turnos').update({ estado: 'ausente' }).eq('id', turnoActual.id);
    if (colaEspera.length > 0) {
      const clienteEnLocal = colaEspera.find((t) => t.modalidad_espera === 'local');
      const siguiente = clienteEnLocal || colaEspera[0];
      await supabase.from('turnos').update({ estado: 'atendiendo', llamado_en: new Date().toISOString() }).eq('id', siguiente.id);
    }
    fetchTurnos();
  };

  const finalizarServicio = async () => {
    if (!turnoActual) return;
    await supabase
      .from('turnos')
      .update({
        estado: 'finalizado',
        finalizado_en: new Date().toISOString(),
      })
      .eq('id', turnoActual.id);

    fetchTurnos();
  };

  return (
    <div className="space-y-6">
      {/* Estado servidor */}
      <div className={`flex items-center justify-between p-4 rounded-2xl border ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <span className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          En Línea
        </span>
        <span className="text-sm font-mono font-bold text-amber-500">{horaActual}</span>
      </div>

      {/* DASHBOARD DE NEGOCIO & MÉTRICAS DEL DÍA */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`border rounded-2xl p-4 text-center shadow-md ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400">Ingresos Hoy</span>
          <p className="text-2xl font-black text-emerald-500 mt-1">${totalIngresos}</p>
        </div>

        <div className={`border rounded-2xl p-4 text-center shadow-md ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400">Atendidos Hoy</span>
          <p className="text-2xl font-black text-amber-500 mt-1">{totalAtendidos}</p>
        </div>

        <div className={`border rounded-2xl p-4 text-center shadow-md ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400">En Espera</span>
          <p className="text-2xl font-black text-indigo-400 mt-1">{colaEspera.length}</p>
        </div>

        <div className={`border rounded-2xl p-4 text-center shadow-md ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <span className="text-[10px] uppercase font-bold text-slate-400">T. Promedio</span>
          <p className="text-2xl font-black text-cyan-400 mt-1">~{tiempoPromedioMinutos}m</p>
        </div>
      </div>

      {/* CLIENTE ACTUAL EN SILLA / LLAMADO */}
      <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center justify-between border-b pb-3 border-slate-700/20">
          <h2 className="text-xs uppercase tracking-widest font-bold text-slate-400">Cliente Actual en Silla</h2>
          {turnoActual && (
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-bold rounded-md uppercase">
              {turnoActual.modalidad_espera === 'diligencia' ? 'Esperando Llegada 🏃‍♂️' : 'En Silla ✂️'}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-center text-slate-500 py-8 animate-pulse text-sm">Cargando...</p>
        ) : turnoActual ? (
          <div className={`border rounded-xl p-6 text-center space-y-4 ${
            isDark ? 'bg-slate-800/50 border-slate-700/60' : 'bg-slate-50 border-slate-200'
          }`}>
            {turnoActual.cliente_llego && (
              <div className="p-3 bg-emerald-500/20 border-2 border-emerald-500 rounded-xl text-center text-emerald-400 font-black text-xs uppercase animate-pulse">
                📍 ¡EL CLIENTE YA LLEGÓ AL LOCAL Y ESTÁ EN ESPERA!
              </div>
            )}

            <span className="text-xs font-semibold uppercase text-slate-400">Turno Asignado</span>
            <p className="text-6xl font-black text-amber-500">{turnoActual.codigo_ticket}</p>
            <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{turnoActual.nombre_cliente}</p>
            
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 text-sm font-semibold">
                ✂️ {turnoActual.tipo_corte || 'Corte clásico'} (${turnoActual.monto || 10})
              </span>
            </div>

            {turnoActual.cliente_telefono && (
              <button
                type="button"
                onClick={() => enviarWhatsApp(turnoActual.cliente_telefono!, turnoActual.nombre_cliente, turnoActual.codigo_ticket)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all active:scale-95"
              >
                📲 Reenviar WhatsApp ({turnoActual.cliente_telefono})
              </button>
            )}

            {turnoActual.modalidad_espera === 'diligencia' && minutosRestantes !== null && !turnoActual.cliente_llego && (
              <div className="p-4 rounded-xl border text-center space-y-3 bg-indigo-500/10 border-indigo-500/30 text-indigo-400">
                <p className="text-xs font-bold uppercase">Tiempo límite de llegada</p>
                <p className="text-3xl font-black font-mono">{minutosRestantes} min</p>
                <button
                  type="button"
                  onClick={confirmarLlegadaCliente}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase rounded-lg shadow-md"
                >
                  💈 Cliente Llegó al Local (Sentar en Silla)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="border border-dashed rounded-xl p-8 text-center text-slate-400 text-sm">
            Silla libre. Presiona "Llamar Siguiente Cliente" para atender.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {!turnoActual ? (
            <button
              onClick={llamarSiguiente}
              disabled={colaEspera.length === 0}
              className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl disabled:opacity-50"
            >
              📢 Llamar Siguiente Cliente
            </button>
          ) : (
            <>
              {turnoActual.modalidad_espera === 'diligencia' && (
                <button
                  onClick={pasarSiguientePorAusencia}
                  className="w-full py-4 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase rounded-xl"
                >
                  🚫 Ausente (Pasar Siguiente)
                </button>
              )}
              <button
                onClick={finalizarServicio}
                className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl"
              >
                ✅ Finalizar Servicio
              </button>
            </>
          )}
        </div>
      </div>

      {/* LISTA DE ESPERA */}
      {colaEspera.length > 0 && (
        <div className={`border rounded-2xl p-5 shadow-xl space-y-3 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            Próximos en Cola ({colaEspera.length})
          </h3>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {colaEspera.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center justify-between border px-4 py-3 rounded-xl text-xs ${
                  isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold">#{idx + 1}</span>
                  <span className="font-extrabold text-amber-500 text-sm">{item.codigo_ticket}</span>
                  <div>
                    <span className={`font-bold text-sm block ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.nombre_cliente}</span>
                    {item.cliente_telefono && <span className="text-[10px] text-slate-400">📱 {item.cliente_telefono}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-md font-semibold ${
                    item.modalidad_espera === 'diligencia' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {item.modalidad_espera === 'diligencia' ? '🏃‍♂️ Fuera' : '💈 En local'}
                  </span>
                  <span className="font-bold text-amber-500">${item.monto || 10}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTORIAL DE ATENDIDOS HOY */}
      {turnosFinalizados.length > 0 && (
        <div className={`border rounded-2xl p-5 shadow-xl space-y-3 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            Historial de Servicios de Hoy ({turnosFinalizados.length})
          </h3>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {turnosFinalizados.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between border px-4 py-2.5 rounded-xl text-xs ${
                  isDark ? 'bg-slate-800/20 border-slate-800/60' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-400">{item.codigo_ticket}</span>
                  <span className={`font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{item.nombre_cliente}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400">{item.tipo_corte}</span>
                  <span className="font-black text-emerald-500">${item.monto}</span>
                </div>
              </div>
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
    <main className={`min-h-screen p-4 md:p-8 transition-colors duration-500 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'
    }`}>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between border-b border-slate-700/20 pb-4">
          <div>
            <h1 className="text-2xl font-black text-amber-500 tracking-wide">PÉGATE AHÍ</h1>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Control de Barbería & Turnos</p>
          </div>

          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-semibold ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
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

        <BarberoContent isDark={isDark} />
      </div>
    </main>
  );
}
