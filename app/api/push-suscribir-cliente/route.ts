import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:contacto@pegateahi.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cliente_telefono, titulo, mensaje, url } = body;

    const telefonoLimpio = String(cliente_telefono || '').replace(/\D/g, '');
    if (!telefonoLimpio) {
      return NextResponse.json({ error: 'Teléfono de cliente requerido' }, { status: 400 });
    }

    const { data: suscripciones, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('rol', 'cliente')
      .eq('cliente_telefono', telefonoLimpio);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!suscripciones || suscripciones.length === 0) {
      return NextResponse.json({ ok: true, enviados: 0 });
    }

    const payload = JSON.stringify({
      title: titulo || '⏰ Tu turno fue cancelado',
      body:
        mensaje ||
        'Tu turno fue cancelado por superar el límite máximo de 15 minutos o por ausencia. Debes volver a programar un nuevo turno.',
      url: url || '/cliente',
      tag: 'turno-cancelado',
    });

    let enviados = 0;

    await Promise.all(
      suscripciones.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          enviados++;
        } catch (err: any) {
          // Limpiar suscripciones expiradas o revocadas por el navegador
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      })
    );

    return NextResponse.json({ ok: true, enviados });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error enviando push' }, { status: 500 });
  }
}
