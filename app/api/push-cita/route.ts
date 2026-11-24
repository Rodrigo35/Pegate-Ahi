import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const record = body.record || body;
    const esTurnoFila = record.tipo === 'turno' || (!record.hora_inicio && record.codigo_ticket);

    if (!record?.nombre_cliente) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:rodrigo@pegateahi.app';

    if (!publicKey || !privateKey) {
      return NextResponse.json({ error: 'Faltan llaves VAPID en Vercel' }, { status: 500 });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, enviados: 0 });
    }

    const barberoTexto = record.barbero_preferido ? ` con ${record.barbero_preferido}` : '';
    let title = '📅 Nueva Cita · Pégate Ahí';
    let messageBody = '';

    if (esTurnoFila) {
      title = '💈 Nuevo Turno Hoy · Pégate Ahí';
      const ticket = record.codigo_ticket ? ` (${record.codigo_ticket})` : '';
      const modalidad = record.modalidad_espera === 'diligencia' ? ' · Diligencia' : ' · En local';
      messageBody = `${record.nombre_cliente}${ticket} entró a la fila para ${record.tipo_corte || 'corte'}${barberoTexto}${modalidad}`;
    } else {
      const horaCorta = String(record.hora_inicio || '').substring(0, 5);
      messageBody = `${record.nombre_cliente} reservó ${record.tipo_corte || 'servicio'}${barberoTexto} para el ${record.fecha} a las ${horaCorta}`;
    }

    const payload = JSON.stringify({
      title,
      body: messageBody,
      url: '/barbero',
    });

    let enviados = 0;
    for (const sub of subs) {
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
