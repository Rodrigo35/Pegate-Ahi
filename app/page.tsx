'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { APP_CONFIG } from '../lib/config';

export default function HomeHub() {
  const [clientUrl, setClientUrl] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('dark');
  const [esNoche, setEsNoche] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setClientUrl(`${window.location.origin}/cliente`);
    }
    setCurrentYear(new Date().getFullYear());

    const hora = new Date().getHours();
    setEsNoche(hora >= 19 || hora < 6);
  }, []);

  const isDark = modoTema === 'auto' ? esNoche : modoTema === 'dark';

  const qrCodeImageUrl = clientUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=0F172A&bgcolor=FFFFFF&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300 ${
        isDark ? 'bg-[#09090B] text-white' : 'bg-[#F4F4F5] text-zinc-900'
      }`}
    >
      {/* Tarjeta principal oscura con marco fino dorado estilo Barber Club */}
      <div
        className={`w-full max-w-[440px] rounded-3xl p-3 sm:p-4 shadow-2xl border transition-colors ${
          isDark
            ? 'bg-[#121215] border-zinc-800'
            : 'bg-white border-zinc-200'
        }`}
      >
        <div className="rounded-2xl border border-[#C59B27]/60 p-5 sm:p-6 flex flex-col justify-between space-y-6">
          {/* Cabecera */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Mini indicador tricolor sutil (Rojo · Blanco · Azul) */}
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-800">
                <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
                <span className="w-2 h-2 rounded-full bg-white" />
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
              </div>
              <span
                className={`text-xs font-extrabold uppercase tracking-widest ${
                  isDark ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                Barber Club
              </span>
            </div>

            <div
              className={`flex items-center gap-1 p-1 rounded-full border text-xs font-bold ${
                isDark
                  ? 'bg-zinc-950 border-zinc-800'
                  : 'bg-zinc-100 border-zinc-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setModoTema('light')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'light'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-400'
                }`}
                title="Modo Claro"
              >
                ☀️
              </button>
              <button
                type="button"
                onClick={() => setModoTema('dark')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  modoTema === 'dark'
                    ? 'bg-[#C59B27] text-zinc-950 shadow-xs'
                    : 'text-zinc-400'
                }`}
                title="Modo Oscuro"
              >
                🌙
              </button>
              <button
                type="button"
                onClick={() => setModoTema('auto')}
                className={`px-2.5 h-7 rounded-full transition-all ${
                  modoTema === 'auto'
                    ? 'bg-[#DC2626] text-white shadow-xs'
                    : 'text-zinc-400'
                }`}
              >
                Auto
              </button>
            </div>
          </header>

          {/* Contenido Principal */}
          <section className="text-center space-y-6">
            <div>
              <span className="text-3xl block mb-1">💈</span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                {APP_CONFIG.nombreNegocio || 'Pégate Ahí'}
              </h1>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#C59B27] mt-1.5">
                Turnos en Vivo · Citas
              </p>
              <p
                className={`text-sm mt-3 max-w-[300px] mx-auto leading-relaxed ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Escanea el código QR para entrar a la fila del día o agendar tu corte sin esperas.
              </p>
            </div>

            {/* Tarjeta QR con borde sutil */}
            <div className="inline-flex flex-col items-center p-4 rounded-2xl bg-white border-2 border-[#C59B27]/50 shadow-lg">
              {qrCodeImageUrl ? (
                <img
                  src={qrCodeImageUrl}
                  alt="Código QR para tomar turno"
                  className="w-48 h-48 rounded-xl"
                />
              ) : (
                <div className="w-48 h-48 bg-zinc-100 animate-pulse rounded-xl flex items-center justify-center text-zinc-900 text-sm font-bold">
                  Cargando QR...
                </div>
              )}
              <span className="text-xs font-black text-zinc-900 mt-2.5 tracking-wide">
                ESCANEA CON TU CÁMARA
              </span>
            </div>

            {/* Botones con acentos puntuales (Rojo acción principal + Azul sutil secundaria) */}
            <div className="space-y-3 pt-1">
              <Link
                href="/cliente"
                className="block w-full py-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base tracking-wide transition-all shadow-lg active:scale-95"
              >
                Tomar Turno o Agendar Cita
              </Link>

              <Link
                href="/barbero"
                className={`block w-full py-3.5 rounded-xl font-extrabold text-sm tracking-wide transition-all border active:scale-95 ${
                  isDark
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-[#2563EB]/60'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-900'
                }`}
              >
                Panel del Barbero
              </Link>
            </div>
          </section>

          <footer
            className={`text-center text-xs pt-2 border-t ${
              isDark
                ? 'text-zinc-500 border-zinc-800/80'
                : 'text-zinc-400 border-zinc-200'
            }`}
          >
            <p>© {currentYear || 2026} Pégate Ahí · Barbería</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
