import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MENSAJES_RECORDATORIO = [
  (nombre: string, servicio: string) => ({
    title: `✂️ ¡Hora de retocar tu ${servicio}, ${nombre}!`,
    body: 'Ya toca mantenimiento para mantener ese estilo impecable. Toca aquí y aparta tu silla sin hacer fila.',
  }),
  (nombre: string, servicio: string) => ({
    title: `💈 ${nombre}, tu corte pide retoque`,
    body: `Pégate ahí antes de que se llene la barbería y renueva tu ${servicio} en segundos.`,
  }),
  (nombre: string, servicio: string) => ({
    title: `🔥 ¿Listo para el retoque, ${nombre}?`,
    body: `Tu barbero está disponible para tu próximo ${servicio}. Revisa la fila en vivo o agenda tu cita.`,
  }),
  (nombre: string, servicio: string) => ({
    title: `⚡ ${nombre}, cero filas para tu retoque`,
    body: `Ya cumpliste los días recomendados desde tu último ${servicio}. Llega justo a tu hora en Pégate Ahí.`,
  }),
];

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:rodrigo@pegateahi.app';

    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'Faltan llaves VAPID' }, { status: 500 });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const ahora = new Date();
    const ahoraMs = ahora.getTime();
    const hace7Dias = new Date(ahoraMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const hoyStr = ahora.toISOString().split('T')[0];

    // 1. Obtener días recomendados de retoque por servicio
    const { data: serviciosConfig } = await supabaseAdmin
      .from('servicios_config')
      .select('nombre, dias_retoque');

    const mapaDiasRetoque = new Map<string, number>(
      (serviciosConfig || []).map((s) => [s.nombre.toLowerCase().trim(), Number(s.dias_retoque) || 7])
    );

    // 2. Obtener suscripciones de clientes
    const { data: subsClientes, error: errorSubs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, cliente_telefono, nombre_cliente, ultimo_recordatorio_en')
      .eq('rol', 'cliente')
      .not('cliente_telefono', 'is', null);

    if (errorSubs) {
      return NextResponse.json({ error: errorSubs.message }, { status: 500 });
    }

    if (!subsClientes || subsClientes.length === 0) {
      return NextResponse.json({ ok: true, enviados: 0, motivo: 'Sin clientes suscritos' });
    }

    // 3. Obtener clientes que ya tienen turno activo hoy o cita futura confirmada para no molestarlos
    const [{ data: turnosActivos }, { data: citasActivas }] = await Promise.all([
      supabaseAdmin
        .from('turnos')
        .select('cliente_telefono')
        .in('estado', ['espera', 'atendiendo']),
      supabaseAdmin
        .from('citas')
        .select('cliente_telefono')
        .gte('fecha', hoyStr)
        .eq('estado', 'confirmada'),
    ]);

    const telefonosConReservaActiva = new Set<string>();
    turnosActivos?.forEach((t) => {
      if (t.cliente_telefono) telefonosConReservaActiva.add(t.cliente_telefono.replace(/\D/g, ''));
    });
    citasActivas?.forEach((c) => {
      if (c.cliente_telefono) telefonosConReservaActiva.add(c.cliente_telefono.replace(/\D/g, ''));
    });

    let enviados = 0;

    for (const sub of subsClientes) {
      const tel = String(sub.cliente_telefono || '').replace(/\D/g, '');
      if (!tel || telefonosConReservaActiva.has(tel)) continue;

      // Validar que no se le haya enviado recordatorio en los últimos 7 días
      if (sub.ultimo_recordatorio_en && sub.ultimo_recordatorio_en > hace7Dias) {
        continue;
      }

      // Buscar su última visita finalizada junto con el servicio realizado
      const { data: ultimoTurno } = await supabaseAdmin
        .from('turnos')
        .select('tipo_corte, finalizado_en, creado_en')
        .ilike('cliente_telefono', `%${tel.slice(-10)}%`)
        .eq('estado', 'finalizado')
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ultimoTurno) continue;

      const fechaUltimoServicio = ultimoTurno.finalizado_en || ultimoTurno.creado_en;
      const diasTranscurridos = Math.floor(
        (ahoraMs - new Date(fechaUltimoServicio).getTime()) / (1000 * 60 * 60 * 24)
      );

      const servicioNombre = (ultimoTurno.tipo_corte || 'corte').trim();
      const diasRequeridos = mapaDiasRetoque.get(servicioNombre.toLowerCase()) ?? 7;

      // Solo enviar si ya cumplió los días configurados para retoque de ese servicio
      if (diasTranscurridos < diasRequeridos) {
        continue;
      }

      const primerNombre = (sub.nombre_cliente || 'Amigo').trim().split(' ')[0];
      const plantilla =
        MENSAJES_RECORDATORIO[Math.floor(Math.random() * MENSAJES_RECORDATORIO.length)];
      const mensaje = plantilla(primerNombre, servicioNombre.toLowerCase());

      const payload = JSON.stringify({
        title: mensaje.title,
        body: mensaje.body,
        url: '/cliente',
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );

        await supabaseAdmin
          .from('push_subscriptions')
          .update({ ultimo_recordatorio_en: ahora.toISOString() })
          .eq('id', sub.id);

        enviados++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return NextResponse.json({ ok: true, enviados });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 });
  }
}
