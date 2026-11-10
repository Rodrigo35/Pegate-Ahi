'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { APP_CONFIG } from '../lib/config';

export default function HomeHub() {
  const [clientUrl, setClientUrl] = useState<string>('');

  useEffect(() => {
    // Detecta la URL actual donde está desplegada la app (Vercel, localhost, etc.)
    if (typeof window !== 'undefined') {
      setClientUrl(`${window.location.origin}/cliente`);
    }
  }, []);

  // Genera el código QR de manera limpia mediante API de imagen rápida
  const qrCodeImageUrl = clientUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(clientUrl)}`
    : '';

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 md:p-10 font-sans">
      {/* Header superior con acceso para el Barbero */}
      <header className="flex items-center justify-between max-w-4xl w-full mx-auto pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-amber-500 tracking-wider">
            {APP_CONFIG.nombreNegocio || 'PÉGATE AHÍ'}
          </h1>
          <p className="text-xs text-slate-400">Sistema Inteligente de Control de Turnos</p>
        </div>

        <Link
          href="/barbero"
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-xs rounded-xl border border-slate-700 transition-all active:scale-95 shadow-md"
        >
          💈 Acceso Barbero
        </Link>
      </header>

      {/* Contenido Central: QR para el Cliente */}
      <section className="max-w-md w-full mx-auto my-auto text-center space-y-6 py-8">
        <div className="space-y-2">
          <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-bold rounded-full uppercase">
            Escanea para tomar tu turno
          </span>
          <h2 className="text-3xl font-black text-slate-100">¿Listo para tu corte?</h2>
          <p className="text-sm text-slate-400">
            Escanea este código QR con la cámara de tu celular para ingresar a la fila virtual sin esperar de pie.
          </p>
        </div>

        {/* Tarjeta del QR */}
        <div className="bg-white p-6 rounded-3xl shadow-2xl inline-block border-4 border-amber-500/30">
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

        {/* Botón alternativo de acceso directo por si prueban en PC sin celular */}
        <div className="pt-2">
          <Link
            href="/cliente"
            className="inline-block text-xs text-slate-400 hover:text-amber-400 underline transition-colors"
          >
            ¿Estás probando en una PC? Haz clic aquí para abrir la vista del cliente
          </Link>
        </div>
      </section>

      {/* Footer minimalista */}
      <footer className="text-center text-slate-600 text-xs py-4 border-t border-slate-900">
        <p>© {new Date().getFullYear()} Pégate Ahí - Software SaaS de Turnos para Barberías</p>
      </footer>
    </main>
  );
}
