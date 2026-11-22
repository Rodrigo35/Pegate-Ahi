import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Usar Service Role para lectura en servidor
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  // 1. Validar que la petición venga del Cron autorizado
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // 2. Obtener servicios y tarifas actualizadas
  const { data: servicios } = await supabase
    .from('servicios_config')
    .select('nombre, precio')
    .order('id', { ascending: true });

  const listaTexto = servicios
    ?.map((s) => `✂️ *${s.nombre}*: $${s.precio}`)
    .join('\n') || '';

  // 3. Obtener teléfonos únicos de clientes (de turnos y citas)
  const { data: turnos } = await supabase
    .from('turnos')
    .select('nombre_cliente, cliente_telefono')
    .not('cliente_telefono', 'is', null);

  const clientesUnicos = new Map<string, string>();
  turnos?.forEach((t) => {
    let tel = t.cliente_telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '58' + tel.substring(1);
    if (tel.length >= 10 && !clientesUnicos.has(tel)) {
      clientesUnicos.set(tel, t.nombre_cliente.split(' ')[0]);
    }
  });

  // 4. Enviar mensaje vía Evolution API (o tu gateway WhatsApp)
  let enviados = 0;
  for (const [telefono, primerNombre] of clientesUnicos.entries()) {
    const mensaje = `¡Hola ${primerNombre}! 👋💈\n\nEsta semana te esperamos en *Pégate Ahí* con nuestros servicios:\n\n${listaTexto}\n\n📲 Reserva tu cita o toma tu turno en vivo aquí:\nhttps://tu-dominio.vercel.app/cliente`;

    await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EVOLUTION_API_KEY!,
      },
      body: JSON.stringify({
        number: telefono,
        text: mensaje,
      }),
    });

    enviados++;
    await sleep(4000); // Pausa anti-ban de 4 segundos entre envíos
  }

  return NextResponse.json({ ok: true, enviados });
}
