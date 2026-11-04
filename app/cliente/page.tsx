'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

interface TurnoCliente {
  id: string;
  codigo_ticket: string;
  nombre_cliente: string;
  cliente_telefono?: string;
  tipo_corte: string;
  monto: number;
  modalidad_espera?: 'local' | 'diligencia';
  estado: 'espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'ausente';
  llamado_en?: string;
  cliente_llego?: boolean;
  creado_en: string;
}

const SERVICIOS = [
  { id: 'corte_clasico', nombre: 'Corte clásico', precio: 10, icono: '✂️' },
  { id: 'corte_barba', nombre: 'Corte + barba', precio: 15, icono: '💈' },
  { id: 'barba', nombre: 'Barba', precio: 7, icono: '🧔' },
];

function ClienteContent({ isDark }: { isDark: boolean }) {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(SERVICIOS[0]);
  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);

  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [totalInicialCola, setTotalInicialCola] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // GPS y Reloj
  const [horaActual, setHoraActual] = useState<string>('');
  const [tiempoRestanteSegundos, setTiempoRestanteSegundos] = useState<number | null>(null);
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);

  // Sintetizador de Alarma Sonora (Sintetizador Web Audio API)
  const sonarAlarma = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // Nota D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // Nota A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch (e) {
      console.log('Audio no permitido aún');
    }
  };

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  // Solicitar ubicación GPS si elige diligencias
  const obtenerUbicacionGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Coordenadas fijas de la barbería (Ejemplo base)
          const latBarberia = 10.998;
          const lngBarberia = -63.805;
          const latCliente = pos.coords.latitude;
          const lngCliente = pos.coords.longitude;

          // Fórmula de Haversine para cálculo de distancia en km
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
        () => console.log('Ubicación denegada o no disponible')
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
      // Disparar alarma si acaba de ser llamado
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

  // Temporizador de 30 minutos
  useEffect(() => {
    if (turno && turno.estado === 'atendiendo' && turno.modalidad_espera === 'diligencia' && turno.llamado_en && !turno.cliente_llego) {
      const interval = setInterval(() => {
        const horaLlamado = new Date(turno.llamado_en!).getTime();
        const ahora = new Date().getTime();
        const segundosTranscurridos = Math.floor((ahora - horaLlamado) / 1000);
        const restante = 1800 - segundosTranscurridos;

        setTiempoRestanteSegundos(restante > 0 ? restante : 0);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      setTiempoRestanteSegundos(null);
    }
  }, [turno]);

  const unirmeALaCola = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

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

  // Acción: Cliente notifica que ya llegó presencialmente
  const notificarLlegadaPresencial = async () => {
    if (!turno) return;
    setTurno({ ...turno, cliente_llego: true });
    await supabase.from('turnos').update({ cliente_llego: true, modalidad_espera: 'local' }).eq('id', turno.id);
  };

  const volverAlInicio = () => {
    setTurno(null);
    setNombre('');
    setTelefono('');
    window.history.pushState({}, '', '/cliente');
  };

  const formatearTiempo = (seg: number) => {
    const mins = Math.floor(seg / 60);
    const secs = seg % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <div className="text-center py-10 text-slate-400 text-xs animate-pulse">Cargando datos...</div>;
  }

  if (turno && turno.estado !== 'cancelado') {
    const tiempoEstimado = personasAdelante * 20;

    return (
      <div className="space-y-6">
        <div className={`flex justify-between items-center text-xs px-4 py-2 rounded-xl border ${
          isDark ? 'text-slate-400 bg-slate-800/40 border-slate-800' : 'text-slate-600 bg-slate-100 border-slate-200'
        }`}>
          <span>Hora Actual:</span>
          <span className="font-mono font-bold text-amber-500 text-sm">{horaActual}</span>
        </div>

        <div className={`p-6 rounded-2xl text-center shadow-lg border ${
          isDark ? 'bg-slate-800/80 border-slate-700/60' : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Tu Número de Turno
          </span>
          <p className="text-5xl font-black text-amber-500 mt-1">{turno.codigo_ticket}</p>
          <p className={`text-sm font-semibold mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{turno.nombre_cliente}</p>
        </div>

        {/* ESTADO EN ESPERA */}
        {turno.estado === 'espera' && (
          <div className="space-y-4">
            {distanciaKm !== null && (
              <div className="p-3 bg-slate-800/40 border border-slate-700 rounded-xl text-center text-xs text-amber-400 font-semibold">
                📍 Distancia actual a la barbería: ~{distanciaKm} km
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-xl text-center border ${isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personas Delante</span>
                <p className={`text-3xl font-black mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{personasAdelante}</p>
              </div>

              <div className={`p-4 rounded-xl text-center border ${isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                <span className={`text-[10px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tiempo Estimado</span>
                <p className="text-3xl font-black text-amber-500 mt-1">~ {tiempoEstimado} min</p>
              </div>
            </div>
          </div>
        )}

        {/* ESTADO LLAMADO / ATENDIENDO */}
        {turno.estado === 'atendiendo' && (
          <div className="space-y-4">
            {turno.cliente_llego ? (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-2">
                <span className="text-3xl">💈</span>
                <h2 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>¡TE HAS REPORTADO EN EL LOCAL!</h2>
                <p className="text-xs text-emerald-400">El barbero ya sabe que estás esperando en la silla.</p>
              </div>
            ) : turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <div className={`border-2 border-amber-500 p-6 rounded-2xl text-center space-y-4 shadow-2xl ${isDark ? 'bg-slate-900' : 'bg-amber-50'}`}>
                <span className="text-4xl">🏃‍♂️</span>
                <h2 className="text-xl font-black text-amber-500 uppercase">¡EL BARBERO TE HA LLAMADO!</h2>
                
                <div className={`p-5 rounded-xl text-center border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <span className="text-[10px] font-bold uppercase text-slate-400">Tiempo Restante para Llegar</span>
                  <p className="text-5xl font-black font-mono text-amber-500 mt-1">{formatearTiempo(tiempoRestanteSegundos)}</p>
                </div>

                {/* BOTÓN PARA NOTIFICAR LLEGADA */}
                <button
                  onClick={notificarLlegadaPresencial}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg animate-bounce"
                >
                  📍 ¡Ya llegué a la Barbería!
                </button>
              </div>
            ) : (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-3">
                <span className="text-3xl">✂️</span>
                <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>¡ES TU TURNO!</h2>
              </div>
            )}
          </div>
        )}

        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className={`border p-6 rounded-2xl text-center space-y-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
            <h2 className={`text-lg font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {turno.estado === 'finalizado' ? '¡Servicio Completado!' : '¡Tiempo Agotado!'}
            </h2>
            <button onClick={volverAlInicio} className="w-full py-3.5 bg-amber-500 text-slate-950 font-black text-xs uppercase rounded-xl">
              🔄 Tomar Nuevo Turno
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={unirmeALaCola} className="space-y-6">
      <div>
        <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Tu Nombre</label>
        <input
          type="text"
          required
          placeholder="Ej: Carlos Pérez"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
        />
      </div>

      <div className="space-y-2">
        <label className={`block text-xs font-bold uppercase ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>¿Dónde esperarás?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModalidadEspera('local')}
            className={`p-3.5 rounded-xl border text-left ${modalidadEspera === 'local' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
          >
            💈 En el Local
          </button>
          <button
            type="button"
            onClick={() => {
              setModalidadEspera('diligencia');
              obtenerUbicacionGPS();
            }}
            className={`p-3.5 rounded-xl border text-left ${modalidadEspera === 'diligencia' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500' : isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
          >
            🏃‍♂️ Diligencias (GPS)
          </button>
        </div>
      </div>

      <button type="submit" disabled={registrando} className="w-full py-4 bg-amber-500 text-slate-950 font-black text-sm uppercase rounded-xl">
        UNIRME A LA COLA
      </button>
    </form>
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
    <main className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'}`}>
      <div className={`max-w-md w-full border rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <header className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/20">
          <div>
            <h1 className="text-2xl font-black text-amber-500">PÉGATE AHÍ</h1>
            <p className="text-[10px] uppercase font-bold text-slate-400">Barbería & Queue System</p>
          </div>
        </header>
        <Suspense fallback={<p className="text-center text-slate-500 text-xs">Cargando...</p>}>
          <ClienteContent isDark={isDark} />
        </Suspense>
      </div>
    </main>
  );
}
