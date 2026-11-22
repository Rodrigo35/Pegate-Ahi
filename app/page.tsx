'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { APP_CONFIG } from '../lib/config';

export default function HomeHub() {
  const [clientUrl, setClientUrl] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('light');
  const [esNoche, setEsNoche] = useState<boolean>(false);

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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=002664&bgcolor=FFFFFF&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 transition-colors duration-500 ${
        isDark ? 'bg-[#001233] text-white' : 'bg-[#EEF1F6] text-[#002664]'
      }`}
    >
      <div
        className="w-full max-w-[440px] rounded-[34px] p-6 sm:p-7 shadow-2xl overflow-hidden flex flex-col justify-between text-white relative"
        style={{
          backgroundColor: '#F2293A',
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent, transparent 14px, rgba(0, 38, 100, 0.14) 14px, rgba(0, 38, 100, 0.14) 22px)',
        }}
      >
        <header className="flex items-center justify-between mb-5 z-10">
          <span className="text-xs font-black uppercase tracking-widest text-white">
            00 · INICIO
          </span>

          <div className="flex items-center gap-1 p-1 rounded-full bg-[#002664]/85 text-xs font-bold">
            <button
              type="button"
              onClick={() => setModoTema('light')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'light' ? 'bg-white text-[#002664]' : 'text-white/80'
              }`}
              title="Fondo Claro"
            >
              ☀️
            </button>
            <button
              type="button"
              onClick={() => setModoTema('dark')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#F2293A] text-white' : 'text-white/80'
              }`}
              title="Fondo Oscuro"
            >
              🌙
            </button>
            <button
              type="button"
              onClick={() => setModoTema('auto')}
              className={`px-2.5 h-7 rounded-full transition-all ${
                modoTema === 'auto' ? 'bg-white text-[#002664]' : 'text-white/80'
              }`}
            >
              Auto
            </button>
          </div>
        </header>

        <section className="text-center space-y-6 my-2 z-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              {APP_CONFIG.nombreNegocio || 'Pégate Ahí'}
            </h1>
            <p className="text-lg font-extrabold text-[#002664] mt-1">
              Turnos y Reservas
            </p>
            <p className="text-sm text-white/95 mt-2.5 max-w-[300px] mx-auto leading-relaxed">
              Escanea el código QR para tomar tu turno del día o agendar tu próxima cita sin hacer fila.
            </p>
          </div>

          <div className="relative inline-flex items-center justify-center mx-auto">
            <div className="bg-white p-4 rounded-3xl shadow-xl border-4 border-[#002664]">
              {qrCodeImageUrl ? (
                <img
                  src={qrCodeImageUrl}
                  alt="Código QR para tomar turno"
                  className="w-48 h-48 rounded-xl"
                />
              ) : (
                <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-[#002664] text-sm font-bold">
                  Cargando QR...
                </div>
              )}
            </div>
            <div className="absolute -right-4 -bottom-2 w-12 h-12 rounded-full bg-[#002664] border-2 border-white flex items-center justify-center text-xl shadow-lg">
              💈
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Link
              href="/cliente"
              className="block w-full py-4 rounded-xl bg-white hover:bg-slate-100 text-[#F2293A] font-black text-base tracking-wide transition-all shadow-lg active:scale-95"
            >
              Reservar Ahora
            </Link>

            <Link
              href="/barbero"
              className="block w-full py-3.5 rounded-xl bg-[#002664] hover:bg-[#001D4D] text-white font-extrabold text-sm tracking-wide transition-all shadow-md active:scale-95"
            >
              Panel del Barbero
            </Link>
          </div>
        </section>

        <footer className="text-center text-xs text-white/90 pt-5 z-10">
          <p>© {currentYear || 2026} Pégate Ahí · Barbería</p>
        </footer>
      </div>
    </main>
  );
}
