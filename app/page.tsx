return (
    <main
      className={`min-h-[100dvh] flex flex-col sm:items-center sm:justify-center p-2 sm:p-5 transition-colors duration-300 ${
        isDark ? 'bg-[#080D1A] text-white' : 'bg-[#F1F5F9] text-slate-900'
      }`}
    >
      <div
        className={`flex-1 sm:flex-initial w-full max-w-[430px] flex flex-col rounded-3xl p-2.5 sm:p-3.5 shadow-2xl border transition-colors ${
          isDark
            ? 'bg-[#0F172A] border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex-1 rounded-2xl border-2 border-[#2563EB]/60 p-4 sm:p-5 flex flex-col justify-between gap-4">
          {/* Cabecera */}
          <header className="flex items-center justify-between gap-2">
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
                className={`text-xs font-extrabold uppercase tracking-wider ${
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

          {/* Hero Central expandido */}
          <section className="flex-1 flex flex-col items-center justify-center text-center gap-5 py-2">
            {/* Emblema circular grande con acceso oculto barbero (1.5s) */}
            <button
              type="button"
              onPointerDown={iniciarToqueBarbero}
              onPointerUp={cancelarToqueBarbero}
              onPointerLeave={cancelarToqueBarbero}
              onPointerCancel={cancelarToqueBarbero}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Emblema Barbería"
              className={`relative w-28 h-28 rounded-full bg-gradient-to-br from-[#2563EB]/20 via-[#2563EB]/10 to-[#DC2626]/20 border-[3px] border-[#2563EB] flex items-center justify-center shadow-xl select-none touch-none transition-transform duration-300 ${
                presionandoBarber ? 'scale-110 border-[#DC2626]' : 'scale-100'
              }`}
            >
              <span className="text-6xl leading-none">💈</span>
              <span className="absolute -bottom-2 px-3 py-0.5 rounded-full bg-[#DC2626] text-white text-[11px] font-black uppercase tracking-wider shadow">
                En Vivo
              </span>
            </button>

            <div className="space-y-1.5">
              <h1 className="text-4xl font-black tracking-tight leading-none break-words">
                {APP_CONFIG.nombreNegocio || 'Pégate Ahí'}
              </h1>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#2563EB]">
                Turnos en Vivo · Citas
              </p>
              <p
                className={`text-sm max-w-[300px] mx-auto leading-snug pt-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Entra a la fila del día o agenda tu corte sin hacer espera en el local.
              </p>
            </div>

            {/* Botones de acción */}
            <div className="w-full space-y-3 pt-2">
              <Link
                href="/cliente"
                className="w-full py-4 px-4 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-base tracking-wide flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-[#DC2626]/25 active:scale-95"
              >
                <span className="text-2xl leading-none">✂️</span>
                <span>Tomar Turno o Agendar</span>
              </Link>

              <div className="grid grid-cols-3 gap-2.5 w-full">
                <button
                  type="button"
                  onClick={() => setMostrarQrModal(true)}
                  className={`py-3.5 px-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-[#2563EB]'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-[#2563EB]'
                  }`}
                >
                  <span className="text-2xl leading-none">📷</span>
                  <span className="text-xs font-black leading-tight">Ver QR</span>
                </button>

                <button
                  type="button"
                  onClick={copiarEnlaceCliente}
                  className={`py-3.5 px-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-[#2563EB]'
                      : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-[#2563EB]'
                  }`}
                >
                  <span className="text-2xl leading-none">{copiadoEnlace ? '✅' : '📋'}</span>
                  <span className="text-xs font-black leading-tight">
                    {copiadoEnlace ? 'Copiado' : 'Copiar Link'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={compartirEnlaceCliente}
                  className="py-3.5 px-2 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white flex flex-col items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                >
                  <span className="text-2xl leading-none">📲</span>
                  <span className="text-xs font-black leading-tight">Compartir</span>
                </button>
              </div>
            </div>
          </section>

          {/* Footer anclado abajo */}
          <footer
            className={`text-center text-xs pt-2.5 border-t space-y-0.5 ${
              isDark
                ? 'text-slate-500 border-slate-800/80'
                : 'text-slate-400 border-slate-200'
            }`}
          >
            <p>
              © {currentYear || 2026} {APP_CONFIG.nombreNegocio || 'Pégate Ahí'} ·{' '}
              <span className="font-bold">v1.0.0</span>
            </p>
            <p className="text-[11px] font-semibold">
              Desarrollado por{' '}
              <a
                href="https://instagram.com/cest.rodrigo.pmv"
                target="_blank"
                rel="noopener noreferrer"
                className="font-extrabold text-[#2563EB] hover:underline"
              >
                (@cest.rodrigo.pmv)
              </a>{' '}
              & Max
            </p>
          </footer>
        </div>
      </div>

      {/* Modal QR instantáneo */}
      {mostrarQrModal && (
        <div
          onClick={() => setMostrarQrModal(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[340px] rounded-3xl p-5 border-2 border-[#2563EB] text-center space-y-4 shadow-2xl ${
              isDark ? 'bg-[#0F172A] text-white' : 'bg-white text-slate-900'
            }`}
          >
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-[#2563EB]">
                Acceso Rápido en Local
              </span>
              <h2 className="text-lg font-black mt-0.5">Escanea con tu cámara</h2>
            </div>

            <div className="p-3.5 rounded-2xl bg-white border-2 border-[#2563EB] inline-block mx-auto shadow">
              {qrCodeImageUrl ? (
                <img
                  src={qrCodeImageUrl}
                  alt="Código QR para tomar turno"
                  className="w-52 h-52 rounded-xl"
                />
              ) : (
                <div className="w-52 h-52 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-slate-900 text-sm font-bold">
                  Cargando QR...
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMostrarQrModal(false)}
              className="w-full py-3 rounded-xl bg-[#DC2626] text-white font-black text-sm active:scale-95"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </main>
  );
