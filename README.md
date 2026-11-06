# 💈 Pégate Ahí — Turnkey Barber & Clinic Smart Queue SaaS System

> **Software as a Service (SaaS)** inteligente de gestión de colas presenciales y remotas en tiempo real, diseñado para barberías, centros de estética, clínicas y locales comerciales con sala de espera.

![Tech Stack](https://img.shields.io/badge/Stack-Next.js%2014%20%7C%20Supabase%20%7C%20TailwindCSS-amber)
![License](https://img.shields.io/badge/License-Commercial%20Ready-emerald)
![Status](https://img.shields.io/badge/Status-Production%20Ready-blue)

---

## 🌟 Características Principales (Key Features)

### 📱 Para el Cliente
- **Turnos Dinámicos & Monitoreo en Tiempo Real:** Interfaz web ultrarrápida sin necesidad de instalar apps nativas.
- **Doble Modalidad de Espera (Local vs. Diligencia):** Permite al cliente esperar en el local o salir a hacer diligencias fuera por 30 minutos.
- **Geolocalización GPS Dinámica:** Cálculo de distancia estimada en km desde la ubicación actual del cliente hasta el negocio.
- **Notificaciones Web & Alarma Sonora:** Alerta en tiempo real mediante Web Audio API cuando el barbero llama al turno.
- **Notificación por WhatsApp:** Enlace directo de un clic para reenviar recordatorios por WhatsApp.

### ✂️ Para el Barbero / Administrador
- **Gestión Inteligente de Cola Presencial:** Algoritmo de prioridad que atiende automáticamente al cliente en la sala de espera sin cancelar ni eliminar a los clientes en diligencia.
- **Dashboard de Métricas & Analítica en Vivo:**
  - Total de ingresos brutos generados en el día ($).
  - Conteo de clientes atendidos.
  - Tiempo promedio exacto por servicio (calculado desde el llamado hasta la finalización).
  - Número de clientes activos en cola de espera.
- **Temporizador de Tolerancia (30 min):** Limpieza y reinicio automático si el barbero atiende a un cliente presencial mientras alguien está fuera.
- **Tema Adaptativo Inteligente (Claro/Oscuro/Auto):** Cambia automáticamente según la hora del día o permite la conmutación manual.

---

## 🚀 Teclado de Tecnología (Tech Stack)

- **Frontend:** Next.js 14 (App Router, React 18, TypeScript)
- **Estilos & UI:** Tailwind CSS (Diseño responsive móvil-first, Dark/Light Mode)
- **Base de Datos & Realtime:** Supabase (PostgreSQL, Realtime Subscriptions)
- **Audio API:** Web Audio API (Sintetizador nativo de alarmas sin librerías pesadas)
- **Deployment:** Vercel Ready (Optimizado para plan Hobby o Pro)

---

## ⚙️ Estructura de Configuración Rápida (`lib/config.ts`)

El proyecto incluye un archivo central de configuración desacoplado para personalizar cualquier negocio en 2 minutos sin tocar el código fuente:

```typescript
export const APP_CONFIG = {
  nombreNegocio: 'PÉGATE AHÍ',
  subtitulo: 'Barbería & Queue System',
  monedaSimbolo: '$',
  ubicacionLocal: { latitud: 10.998, longitud: -63.805 },
  tiempoEstimadoPorClienteMin: 20,
  tiempoLimiteDiligenciaMin: 30,
  servicios: [
    { id: 'corte_clasico', nombre: 'Corte clásico', precio: 10, icono: '✂️' },
    { id: 'corte_barba', nombre: 'Corte + barba', precio: 15, icono: '💈' },
    { id: 'barba', nombre: 'Barba', precio: 7, icono: '🧔' },
  ],
};
