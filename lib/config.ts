// Configuración Central de la Marca / Barbería
export const APP_CONFIG = {
  // Información del Negocio
  nombreNegocio: 'PÉGATE AHÍ',
  subtitulo: 'Barbería & Queue System',
  monedaSimbolo: '$',
  
  // Coordenadas GPS del Local (para cálculo de distancia en diligencias)
  ubicacionLocal: {
    latitud: 10.998,
    longitud: -63.805,
  },

  // Tiempos y Reglas de Negocio
  tiempoEstimadoPorClienteMin: 20, // Minutos calculados por persona en espera
  tiempoLimiteDiligenciaMin: 30,  // Minutos de tolerancia para clientes en la calle

  // Catálogo de Servicios y Precios
  servicios: [
    { id: 'corte_clasico', nombre: 'Corte clásico', precio: 10, icono: '✂️' },
    { id: 'corte_barba', nombre: 'Corte + barba', precio: 15, icono: '💈' },
    { id: 'barba', nombre: 'Barba', precio: 7, icono: '🧔' },
  ],
};
