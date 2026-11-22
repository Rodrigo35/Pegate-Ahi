import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '../../../../lib/config';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  // 1. Seguridad: Vercel envía automáticamente este header con tu CRON_SECRET
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // 2. Obtener servicios y tarifas actuales
    const { data: servicios, error: errServicios } = await supabase
      .from('servicios_config')
      .select('nombre, precio')
      .order('id', { ascending: true });

    if (errServicios || !servicios || servicios.length === 0) {
      return NextResponse.json({ error: 'Sin servicios configurados' }, { status: 500 });
    }

    const listaServiciosTexto = servicios
      .map((s) => `✂️ *${s.nombre}*: ${APP_CONFIG.monedaSimbolo}${s.precio}`)
      .join('\n');

    // 3. Recopilar clientes únicos desde 'turnos' y 'citas'
    const [{ data: turnos }, { data: citas }] = await Promise.all([
      supabase
        .from('turnos')
        .select('nombre_cliente, cliente_telefono')
        .not('cliente_telefono', 'is', null),
      supabase
        .from('citas')
        .select('nombre_cliente, cliente_telefono')
        .not('cliente_telefono', 'is', null),
    ]);

    const clientesUnicos = new Map<string, string>();
    const todosLosRegistros = [...(turnos || []), ...(citas || [])];

    for (const reg of todosLosRegistros) {
      if (!reg.cliente_telefono) continue;
      let tel = reg.cliente_telefono.replace(/\D/g, '');
      if (tel.startsWith('0')) tel = '58' + tel.substring(1);

      if (tel.length >= 10 && !clientesUnicos.has(tel)) {
        const primerNombre = (reg.nombre_cliente || 'Cliente').trim().split(' ')[0];
        clientesUnicos.set(tel, primerNombre);
      }
    }

    if (clientesUnicos.size === 0) {
      return NextResponse.json({ ok: true, mensaje: 'No hay clientes registrados aún', enviados: 0 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pegate-ahi.vercel.app';

    // 4. Envío mediante WhatsApp API (Evolution API / Gateway)
    const promesasEnvio = Array.from(clientesUnicos.entries()).map(async ([telefono, nombre]) => {
      const mensaje =
        `¡Hola ${nombre}! 👋💈\n\n` +
        `Arranca la semana con buen corte en *${APP_CONFIG.nombreNegocio}*.\n` +
        `Nuestros servicios disponibles:\n\n` +
        `${listaServiciosTexto}\n\n` +
        `📲 Toma tu turno en vivo o agenda tu cita aquí:\n${appUrl}/cliente`;

      const res = await fetch(
        `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: process.env.EVOLUTION_API_KEY!,
          },
          body: JSON.stringify({
            number: telefono,
            text: mensaje,
          }),
        }
      );

      return res.ok;
    });

    const resultados = await Promise.allSettled(promesasEnvio);
    const enviados = resultados.filter((r) => r.status === 'fulfilled' && r.value).length;

    return NextResponse.json({
      ok: true,
      totalClientes: clientesUnicos.size,
      enviados,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
