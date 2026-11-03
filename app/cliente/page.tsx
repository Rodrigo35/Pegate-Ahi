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
  creado_en: string;
}

const SERVICIOS = [
  { id: 'corte_clasico', nombre: 'Corte clásico', precio: 10, icono: '✂️' },
  { id: 'corte_barba', nombre: 'Corte + barba', precio: 15, icono: '💈' },
  { id: 'barba', nombre: 'Barba', precio: 7, icono: '🧔' },
];

function ClienteContent() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || searchParams.get('id');

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(SERVICIOS[0]);
  const [modalidadEspera, setModalidadEspera] = useState<'local' | 'diligencia'>('local');
  const [registrando, setRegistrando] = useState(false);

  const [turno, setTurno] = useState<TurnoCliente | null>(null);
  const [personasAdelante, setPersonasAdelante] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [horaActual, setHoraActual] = useState<string>('');
  const [tiempoRestanteSegundos, setTiempoRestanteSegundos] = useState<number | null>(null);

  useEffect(() => {
    const actualizarHora = () => {
      const ahora = new Date();
      setHoraActual(ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    actualizarHora();
    const interval = setInterval(actualizarHora, 1000);
    return () => clearInterval(interval);
  }, []);

  const cargarTurnoYPosicion = async (codigoOId: string) => {
    let query = supabase.from('turnos').select('*');
    if (codigoOId.includes('-')) {
      query = query.eq('codigo_ticket', codigoOId.toUpperCase());
    } else {
      query = query.eq('id', codigoOId);
    }

    const { data: miTurno, error } = await query.single();

    if (!error && miTurno) {
      setTurno(miTurno as TurnoCliente);

      if (miTurno.estado === 'espera') {
        const { count } = await supabase
          .from('turnos')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'espera')
          .lt('creado_en', miTurno.creado_en);

        setPersonasAdelante(count || 0);
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
    if (turno && turno.estado === 'atendiendo' && turno.modalidad_espera === 'diligencia' && turno.llamado_en) {
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
    return <div className="text-center py-10 text-slate-400 text-xs">Cargando datos...</div>;
  }

  if (turno && turno.estado !== 'cancelado') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center text-xs text-slate-400 bg-slate-800/40 px-4 py-2 rounded-xl border border-slate-800">
          <span>Hora Actual:</span>
          <span className="font-mono font-bold text-amber-400 text-sm">{horaActual}</span>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-6 rounded-2xl text-center shadow-lg">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tu Número de Turno</span>
          <p className="text-5xl font-black text-amber-400 mt-1">{turno.codigo_ticket}</p>
          <p className="text-sm font-semibold text-white mt-1">{turno.nombre_cliente}</p>
          <span className="inline-block mt-2 px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs rounded-full font-medium">
            {turno.tipo_corte} (${turno.monto})
          </span>
        </div>

        {turno.estado === 'espera' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Personas Delante</span>
                <p className="text-3xl font-black text-slate-100 mt-1">{personasAdelante}</p>
              </div>

              <div className="bg-slate-800/40 border border-slate-800 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Tiempo Estimado</span>
                <p className="text-3xl font-black text-amber-400 mt-1">~ {personasAdelante * 20} min</p>
              </div>
            </div>
          </div>
        )}

        {turno.estado === 'atendiendo' && (
          <div className="space-y-4">
            {turno.modalidad_espera === 'diligencia' && tiempoRestanteSegundos !== null ? (
              <div className="bg-slate-900 border-2 border-amber-500 p-6 rounded-2xl text-center space-y-4">
                <span className="text-4xl">🏃‍♂️</span>
                <h2 className="text-xl font-black text-amber-400 uppercase">¡EL BARBERO TE HA LLAMADO!</h2>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Tiempo Restante para Llegar</span>
                  <p className="text-5xl font-black font-mono text-amber-400 mt-1">
                    {formatearTiempo(tiempoRestanteSegundos)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-500/20 border-2 border-emerald-500 p-6 rounded-2xl text-center space-y-3">
                <span className="text-3xl">✂️</span>
                <h2 className="text-2xl font-black text-white">¡ES TU TURNO!</h2>
              </div>
            )}
          </div>
        )}

        {(turno.estado === 'finalizado' || turno.estado === 'ausente') && (
          <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-2xl text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-200">
              {turno.estado === 'finalizado' ? '¡Servicio Completado!' : '¡Tiempo Agotado!'}
            </h2>
            <button
              onClick={volverAlInicio}
              className="w-full py-3.5 bg-amber-500 text-slate-950 font-black text-xs uppercase rounded-xl"
            >
              🔄 Tomar Nuevo Turno
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={unirmeALaCola} className="space-y-5">
      <div>
        <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Tu Nombre</label>
        <input
          type="text"
          required
          placeholder="Ej: Carlos Pérez"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-300 uppercase mb-2">Teléfono / WhatsApp (Opcional)</label>
        <input
          type="tel"
          placeholder="Ej: 04141234567"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-300 uppercase">¿Dónde esperarás?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModalidadEspera('local')}
            className={`p-3 rounded-xl border text-left transition-all ${
              modalidadEspera === 'local' ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-slate-800/40 border-slate-800'
            }`}
          >
            💈 En el Local
          </button>
          <button
            type="button"
            onClick={() => setModalidadEspera('diligencia')}
            className={`p-3 rounded-xl border text-left transition-all ${
              modalidadEspera === 'diligencia' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400' : 'bg-slate-800/40 border-slate-800'
            }`}
          >
            🏃‍♂️ Diligencias
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={registrando}
        className="w-full py-4 bg-amber-500 text-slate-950 font-black text-sm uppercase rounded-xl"
      >
        UNIRME A LA COLA
      </button>
    </form>
  );
}

export default function ClienteView() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <header className="text-center mb-6">
          <h1 className="text-2xl font-black text-amber-500">PÉGATE AHÍ</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase">Barbería & Queue System</p>
        </header>
        <Suspense fallback={<p className="text-center text-slate-500 text-xs">Cargando...</p>}>
          <ClienteContent />
        </Suspense>
      </div>
    </main>
  );
}
