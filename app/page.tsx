'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { APP_CONFIG } from '../lib/config';

export default function HomeHub() {
  const [clientUrl, setClientUrl] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [modoTema, setModoTema] = useState<'auto' | 'light' | 'dark'>('auto');
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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=10&color=232931&bgcolor=FFFFFF&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 transition-colors duration-500 ${
        isDark ? 'bg-[#0F1216] text-[#F4F3F1]' : 'bg-[#C47E52] text-[#232931]'
      }`}
    >
      {/* Contenedor estilo pantalla de bienvenida de la referencia */}
      <div
        className={`w-full max-w-[410px] rounded-[36px] p-6 shadow-2xl border flex flex-col justify-between transition-colors duration-500 ${
          isDark
            ? 'bg-[#15191E] border-[#262C35]'
            : 'bg-[#F4F3F1] border-white/60'
        }`}
      >
        {/* Barra superior con conmutador de tema */}
        <header className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#C47E52]">
            Pégate Ahí
          </span>

          <div
            className={`flex items-center gap-0.5 p-1 rounded-full border text-[10px] font-bold ${
              isDark ? 'bg-[#1D2229] border-[#2E353F]' : 'bg-white border-[#E5E2DC]'
            }`}
          >
            <button
              type="button"
              onClick={() => setModoTema('light')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'light' ? 'bg-[#232931] text-white' : 'text-[#8C8881]'
              }`}
              title="Modo Claro"
            >
              ☀️
            </button>
            <button
              type="button"
              onClick={() => setModoTema('dark')}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                modoTema === 'dark' ? 'bg-[#C47E52] text-white' : 'text-[#8C8881]'
              }`}
              title="Modo Oscuro"
            >
              🌙
            </button>
            <button
              type="button"
              onClick={() => setModoTema('auto')}
              className={`px-2 h-6 rounded-full transition-all ${
                modoTema === 'auto'
                  ? isDark
                    ? 'bg-[#C47E52] text-white'
                    : 'bg-[#232931] text-white'
                  : 'text-[#8C8881]'
              }`}
              title="Modo Automático"
            >
              Auto
            </button>
          </div>
        </header>

        {/* Identidad Central estilo "THE BARBER" de la 1ra pantalla */}
        <section className="text-center space-y-5 my-2">
          <div className="space-y-2">
            <div className="w-20 h-20 rounded-full bg-[#C47E52] text-white flex items-center justify-center text-4xl mx-auto shadow-lg">
              🧔🏻
            </div>
            <div className="pt-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#C47E52]">
                Barbería & Estilo
              </p>
              <h1 className="text-2xl font-black tracking-tight uppercase mt-0.5">
                {APP_CONFIG.nombreNegocio || 'PÉGATE AHÍ'}
              </h1>
              <p className="text-xs text-[#8C8881] mt-1 max-w-[260px] mx-auto">
                Escanea el código QR para entrar a la fila virtual sin esperar de pie.
              </p>
            </div>
          </div>

          {/* Tarjeta limpia del QR */}
          <div className="bg-white p-4 rounded-3xl inline-block shadow-md border border-[#E5E2DC]">
            {qrCodeImageUrl ? (
              <img
                src={qrCodeImageUrl}
                alt="Código QR para tomar turno"
                className="w-44 h-44 mx-auto rounded-xl"
              />
            ) : (
              <div className="w-44 h-44 bg-[#F4F3F1] animate-pulse rounded-xl flex items-center justify-center text-[#8C8881] text-xs font-bold">
                Cargando QR...
              </div>
            )}
          </div>

          {/* Botones apilados estilo "Book Now" y "Login" */}
          <div className="space-y-2.5 pt-2">
            <Link
              href="/cliente"
              className={`block w-full py-3.5 rounded-full font-bold text-xs tracking-wide transition-all shadow-md active:scale-95 ${
                isDark
                  ? 'bg-[#C47E52] hover:bg-[#B36E43] text-white'
                  : 'bg-[#232931] hover:bg-[#181C22] text-white'
              }`}
            >
              ✂️ Tomar Turno / Reservar
            </Link>

            <Link
              href="/barbero"
              className={`block w-full py-3.5 rounded-full font-bold text-xs tracking-wide border transition-all active:scale-95 ${
                isDark
                  ? 'bg-transparent border-[#2E353F] text-[#F4F3F1] hover:border-[#C47E52]'
                  : 'bg-transparent border-[#232931] text-[#232931] hover:bg-[#232931]/5'
              }`}
            >
              💈 Acceso Barbero
            </Link>
          </div>
        </section>

        {/* Footer minimalista */}
        <footer className="text-center text-[10px] text-[#8C8881] pt-6 mt-2">
          <p>© {currentYear || 2026} Pégate Ahí · Turnos Inteligentes</p>
        </footer>
      </div>
    </main>
  );
}
