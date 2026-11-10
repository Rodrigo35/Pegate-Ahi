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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main className={`min-h-screen flex flex-col justify-between p-6 md:p-10 font-sans transition-colors duration-500 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Header superior con conmutador de tema y acceso para el Barbero */}
      <header className="flex items-center justify-between max-w-4xl w-full mx-auto pb-6 border-b border-slate-700/20">
        <div>
          <h1 className="text-2xl font-black text-amber-500 tracking-wider">
            {APP_CONFIG.nombreNegocio || 'PÉGATE AHÍ'}
          </h1>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Sistema Inteligente de Control de Turnos
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de Tema (Claro / Oscuro / Auto) */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-semibold ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-200 border-slate-300'
          }`}>
            <button
              type="button"
              onClick={() => setModoTema('light')}
              className={`p-1.5 rounded-lg transition-all ${modoTema === 'light' ? 'bg-amber-500 text-slate-950 font-bold' : isDark ? 'text-slate-400' : 'text-slate-600'}`}
              title="Modo Claro"
            >
              ☀️
            </button>
            <button
              type="button"
              onClick={() => setModoTema('dark')}
              className={`p-1.5 rounded-lg transition-all ${modoTema === 'dark' ? 'bg-amber-500 text-slate-950 font-bold' : isDark ? 'text-slate-400' : 'text-slate-600'}`}
              title="Modo Oscuro"
            >
              🌙
            </button>
            <button
              type="button"
              onClick={() => setModoTema('auto')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${modoTema === 'auto' ? 'bg-amber-500 text-slate-950' : isDark ? 'text-slate-400' : 'text-slate-600'}`}
              title="Modo Automático"
            >
              🔄 Auto
            </button>
          </div>

          <Link
            href="/barbero"
            className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs rounded-xl border transition-all active:scale-95 shadow-md ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700'
                : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
            }`}
          >
            💈 Acceso Barbero
          </Link>
        </div>
      </header>

      {/* Contenido Central: QR para el Cliente */}
      <section className="max-w-md w-full mx-auto my-auto text-center space-y-6 py-8">
        <div className="space-y-2">
          <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold rounded-full uppercase">
            Escanea para tomar tu turno
          </span>
          <h2 className={`text-3xl font-black ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            ¿Listo para tu corte?
          </h2>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Escanea este código QR con la cámara de tu celular para ingresar a la fila virtual sin esperar de pie.
          </p>
        </div>

        {/* Tarjeta del QR */}
        <div className={`p-6 rounded-3xl shadow-2xl inline-block border-4 ${
          isDark ? 'bg-white border-amber-500/30' : 'bg-white border-amber-500/40 shadow-slate-300'
        }`}>
          {qrCodeImageUrl ? (
            <img
              src={qrCodeImageUrl}
              alt="Código QR para tomar turno"
              className="w-56 h-56 mx-auto rounded-lg"
            />
          ) : (
            <div className="w-56 h-56 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center text-slate-500 text-xs font-bold">
              Cargando QR...
            </div>
          )}
        </div>

        {/* Botón alternativo de acceso directo */}
        <div className="pt-2">
          <Link
            href="/cliente"
            className={`inline-block text-xs underline transition-colors ${
              isDark ? 'text-slate-400 hover:text-amber-400' : 'text-slate-600 hover:text-amber-600'
            }`}
          >
            ¿Estás probando en una PC? Haz clic aquí para abrir la vista del cliente
          </Link>
        </div>
      </section>

      {/* Footer minimalista */}
      <footer className={`text-center text-xs py-4 border-t ${
        isDark ? 'text-slate-600 border-slate-900' : 'text-slate-400 border-slate-200'
      }`}>
        <p>© {currentYear || 2026} Pégate Ahí - Software SaaS de Turnos para Barberías</p>
      </footer>
    </main>
  );
}
