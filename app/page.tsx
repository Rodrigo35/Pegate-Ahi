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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=10&color=072742&bgcolor=FFFFFF&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 transition-colors duration-500 ${
        isDark ? 'bg-[#041626] text-white' : 'bg-[#D6D8DC] text-[#072742]'
      }`}
    >
      {/* Contenedor estilo 1ra pantalla "BARBER SHOP / BOOKING APPS" */}
      <div
        className={`w-full max-w-[410px] rounded-[34px] p-6 shadow-2xl border-2 flex flex-col justify-between transition-colors duration-500 ${
          isDark
            ? 'bg-[#072742] border-[#123D63] text-white'
            : 'bg-[#072742] border-[#072742] text-white'
        }`}
      >
        {/* Barra superior con conmutador de tema */}
        <header className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#37B9C5]">
            PÉGATE AHÍ
          </span>

          <div className="flex items-center gap-0.5 p-1 rounded-full bg-[#04182B] border border-[#143F66] text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setModoTema('light')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'light' ? 'bg-[#F5D042] text-[#072742]' : 'text-slate-400'
              }`}
              title="Fondo Claro"
            >
              ☀️
            </button>
            <button
              type="button"
              onClick={() => setModoTema('dark')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#C62828] text-white' : 'text-slate-400'
              }`}
              title="Fondo Oscuro"
            >
              🌙
            </button>
            <button
              type="button"
              onClick={() => setModoTema('auto')}
              className={`px-2 h-6 rounded-full transition-all ${
                modoTema === 'auto' ? 'bg-[#37B9C5] text-[#072742]' : 'text-slate-400'
              }`}
            >
              Auto
            </button>
          </div>
        </header>

        {/* Identidad Central estilo "BARBER SHOP" con círculo blanco */}
        <section className="text-center space-y-5 my-2">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-wider uppercase text-[#C62828] leading-none">
              {APP_CONFIG.nombreNegocio || 'BARBER SHOP'}
            </h1>
            <div className="flex items-center justify-center gap-2 text-xs font-extrabold tracking-widest uppercase text-white">
              <span>✂️</span>
              <span>TURNOS & CITAS</span>
              <span>✂️</span>
            </div>
          </div>

          {/* Círculo blanco central con el QR */}
          <div className="w-56 h-56 rounded-full bg-white p-5 flex items-center justify-center mx-auto shadow-xl border-4 border-[#37B9C5]/30">
            {qrCodeImageUrl ? (
              <img
                src={qrCodeImageUrl}
                alt="Código QR para tomar turno"
                className="w-40 h-40 rounded-lg"
              />
            ) : (
              <div className="w-40 h-40 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center text-[#072742] text-xs font-bold">
                Cargando QR...
              </div>
            )}
          </div>

          {/* Etiqueta turquesa estilo "BOOKING APPS" */}
          <div>
            <span className="inline-block px-5 py-1.5 rounded-md bg-[#37B9C5] text-[#072742] font-black text-xs uppercase tracking-widest shadow-md">
              ESCANEA PARA TU TURNO
            </span>
            <p className="text-[11px] text-slate-300 mt-2.5 max-w-[260px] mx-auto leading-relaxed">
              Ingresa a la fila virtual desde tu teléfono sin esperar de pie en el local.
            </p>
          </div>

          {/* Botones de acción principales */}
          <div className="space-y-2.5 pt-1">
            <Link
              href="/cliente"
              className="block w-full py-3.5 rounded-xl bg-[#C62828] hover:bg-[#B02020] text-white font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
              ✂️ TOMAR TURNO / RESERVAR
            </Link>

            <Link
              href="/barbero"
              className="block w-full py-3 rounded-xl bg-[#0B3559] hover:bg-[#104470] border border-[#37B9C5]/40 text-[#F5D042] font-extrabold text-xs uppercase tracking-wider transition-all active:scale-95"
            >
              💈 ACCESO BARBERO
            </Link>
          </div>
        </section>

        {/* Indicador de 3 puntos estilo carrusel de la imagen + Footer */}
        <footer className="text-center space-y-2 pt-5">
          <div className="flex items-center justify-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#C62828]" />
            <span className="w-2.5 h-2.5 rounded-full bg-white" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/40" />
          </div>
          <p className="text-[10px] text-slate-400">
            © {currentYear || 2026} Pégate Ahí
          </p>
        </footer>
      </div>
    </main>
  );
}
