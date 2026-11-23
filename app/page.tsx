'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { APP_CONFIG } from '../lib/config';

const THEME_STORAGE_KEY = 'pegate_ahi_tema';

export default function HomeHub() {
  const router = useRouter();
  const [clientUrl, setClientUrl] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('auto');
  const [esNoche, setEsNoche] = useState<boolean>(false);
  const [presionandoBarber, setPresionandoBarber] = useState<boolean>(false);
  const [copiadoEnlace, setCopiadoEnlace] = useState<boolean>(false);

  const timerAccesoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cambiarTema = (nuevoModo: 'auto' | 'light' | 'dark') => {
    setModoTema(nuevoModo);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nuevoModo);
    } catch {
      // Ignorar si localStorage está bloqueado
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setClientUrl(`${window.location.origin}/cliente`);
    }
    setCurrentYear(new Date().getFullYear());

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

    return () => {
      clearInterval(intervalHora);
      if (timerAccesoRef.current) clearTimeout(timerAccesoRef.current);
    };
  }, []);

  const iniciarToqueBarbero = () => {
    setPresionandoBarber(true);
    timerAccesoRef.current = setTimeout(() => {
      setPresionandoBarber(false);
      router.push('/barbero');
    }, 1500);
  };

  const cancelarToqueBarbero = () => {
    setPresionandoBarber(false);
    if (timerAccesoRef.current) {
      clearTimeout(timerAccesoRef.current);
      timerAccesoRef.current = null;
    }
  };

  const copiarEnlaceCliente = async () => {
    if (!clientUrl) return;
    try {
      await navigator.clipboard.writeText(clientUrl);
      setCopiadoEnlace(true);
      setTimeout(() => setCopiadoEnlace(false), 2000);
    } catch {
      // Ignorar si no hay permiso de portapapeles
    }
  };

  const compartirEnlaceCliente = async () => {
    if (!clientUrl) return;
    const nombreLocal = APP_CONFIG.nombreNegocio || 'Pégate Ahí';
    const textoCompartir = `¡Pide tu turno en vivo o agenda tu cita en ${nombreLocal} aquí! ✂️💈`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: nombreLocal,
          text: textoCompartir,
          url: clientUrl,
        });
        return;
      } catch {
        // Si el usuario cancela el diálogo nativo, no hacer nada
        return;
      }
    }

    const mensajeWa = encodeURIComponent(`${textoCompartir}\n${clientUrl}`);
    window.open(`https://wa.me/?text=${mensajeWa}`, '_blank');
  };

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  const qrCodeImageUrl = clientUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=0F172A&bgcolor=FFFFFF&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 ${
        isDark ? 'bg-[#080D1A] text-white' : 'bg-[#F1F5F9] text-slate-900'
      }`}
    >
      <div
        className={`w-full max-w-[440px] rounded-3xl p-3 sm:p-4 shadow-2xl border transition-colors ${
          isDark
            ? 'bg-[#0F172A] border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="rounded-2xl border-2 border-[#2563EB]/60 p-5 sm:p-6 flex flex-col justify-between space-y-6">
          {/* Cabecera */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                  isDark
                    ? 'bg-slate-950 border-slate-800'
                    : 'bg-slate-100 border-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                <span className="w-2 h-2 rounded-full bg-white border border-slate-300" />
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
              </div>
              <span
                className={`text-xs font-extrabold uppercase tracking-widest ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Barber Club
              </span>
            </div>

            <div
              className={`flex items-center gap-1 p-1 rounded-full border text-xs font-bold ${
                isDark
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => cambiarTema('light')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-400'
                }`}
                title="Modo Claro"
              >
                ☀️
              </button>
              <button
                type="button"
                onClick={() => cambiarTema('dark')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'dark'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-slate-400'
                }`}
                title="Modo Oscuro"
              >
                🌙
              </button>
              <button
                type="button"
                onClick={() => cambiarTema('auto')}
                className={`px-2.5 h-7 rounded-full transition-all ${
                  modoTema === 'auto'
                    ? 'bg-[#DC2626] text-white shadow-xs'
                    : 'text-slate-400'
                }`}
              >
                Auto
              </button>
            </div>
          </header>

          {/* Contenido Principal */}
          <section className="text-center space-y-5">
            <div>
              <span
                onPointerDown={iniciarToqueBarbero}
                onPointerUp={cancelarToqueBarbero}
                onPointerLeave={cancelarToqueBarbero}
                onPointerCancel={cancelarToqueBarbero}
                onContextMenu={(e) => e.preventDefault()}
                className={`text-3xl inline-block mb-1 select-none touch-none cursor-default transition-transform duration-300 ${
                  presionandoBarber ? 'scale-125 opacity-80' : 'scale-100'
                }`}
              >
                💈
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                {APP_CONFIG.nombreNegocio || 'Pégate Ahí'}
              </h1>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#2563EB] mt-1.5">
                Turnos en Vivo · Citas
              </p>
              <p
                className={`text-sm mt-3 max-w-[300px] mx-auto leading-relaxed ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Escanea el código QR para entrar a la fila del día o agendar tu corte sin esperas.
              </p>
            </div>

            {/* Tarjeta QR */}
            <div className="inline-flex flex-col items-center p-4 rounded-2xl bg-white border-2 border-[#2563EB] shadow-lg">
              {qrCodeImageUrl ? (
                <img
                  src={qrCodeImageUrl}
                  alt="Código QR para tomar turno"
                  className="w-48 h-48 rounded-xl"
                />
              ) : (
                <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-slate-900 text-sm font-bold">
                  Cargando QR...
                </div>
              )}
              <span className="text-xs font-black text-slate-900 mt-2.5 tracking-wide">
                ESCANEA CON TU CÁMARA
              </span>
            </div>

            {/* Acciones para cliente y compartir enlace */}
            <div className="space-y-2.5 pt-1">
              <Link
                href="/cliente"
                className="block w-full py-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base tracking-wide transition-all shadow-lg active:scale-95"
              >
                Tomar Turno o Agendar Cita
              </Link>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={copiarEnlaceCliente}
                  className={`py-3 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-[#2563EB]'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-[#2563EB]'
                  }`}
                >
                  <span>{copiadoEnlace ? '✅' : '📋'}</span>
                  <span>{copiadoEnlace ? '¡Copiado!' : 'Copiar Enlace'}</span>
                </button>

                <button
                  type="button"
                  onClick={compartirEnlaceCliente}
                  className="py-3 px-3 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                >
                  <span>📲</span>
                  <span>Compartir Link</span>
                </button>
              </div>
            </div>
          </section>

          <footer
            className={`text-center text-xs pt-3 border-t space-y-1 ${
              isDark
                ? 'text-slate-500 border-slate-800/80'
                : 'text-slate-400 border-slate-200'
            }`}
          >
            <p>© {currentYear || 2026} {APP_CONFIG.nombreNegocio || 'Pégate Ahí'} · Barbería</p>
            <p className="text-[11px] font-semibold">
              Desarrollado por{' '}
              <a
                href="https://instagram.com/cest.rodrigo.pmv"
                target="_blank"
                rel="noopener noreferrer"
                className="font-extrabold text-[#2563EB] hover:underline"
              >
                Rodrigo Martínez (@cest.rodrigo.pmv)
              </a>{' '}
              & Max
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
