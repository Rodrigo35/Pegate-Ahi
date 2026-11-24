import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('x-webhook-secret');
    if (
      process.env.PUSH_WEBHOOK_SECRET &&
      authHeader !== process.env.PUSH_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@pegateahi.app',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const body = await req.json();
    // Soporta tanto Database Webhook de Supabase (body.record) como llamada directa
    const cita = body.record || body;

    const horaCorta = cita?.hora_inicio ? cita.hora_inicio.substring(0, 5) : '';
    const fechaCorta = cita?.fecha ? cita.fecha.slice(5) : '';

    const payload = JSON.stringify({
      title: '💈 Nueva Cita · Pégate Ahí',
      body: `${cita.nombre_cliente || 'Un cliente'} agendó ${cita.tipo_corte || 'servicio'} (${fechaCorta} · ${horaCorta})`,
      url: '/barbero',
    });

    const { data: suscripciones } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*');

    if (!suscripciones || suscripciones.length === 0) {
      return NextResponse.json({ ok: true, enviados: 0 });
    }

    let enviados = 0;
    for (const sub of suscripciones) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        enviados++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // Eliminar suscripción si expiró o fue revocada
        if (statusCode === 404 || statusCode === 410) {
          await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
      }
    }

    return NextResponse.json({ ok: true, enviados });
  } catch (error) {
    console.error('Error enviando Web Push:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
