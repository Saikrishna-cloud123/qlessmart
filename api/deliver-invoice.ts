import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb } from './_lib/firebaseAdmin';

/**
 * POST /api/deliver-invoice
 * Body: { session_id: string }
 *
 * Looks up the store's configured invoice delivery webhook, fetches the
 * session data and items, then POSTs the invoice payload to the configured URL.
 * This is a best-effort delivery — errors are logged but don't fail the request.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.body || {};
    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const db = getAdminDb();

    // Fetch the session
    const sessionDoc = await db.collection('sessions').doc(session_id).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const sessionData = sessionDoc.data()!;

    // Fetch the mart to get invoice_delivery config
    const martDoc = await db.collection('marts').doc(sessionData.mart_id).get();
    if (!martDoc.exists) {
      return res.status(200).json({ delivered: false, reason: 'Mart not found' });
    }
    const martData = martDoc.data()!;
    const config = martData.config || {};
    const invoiceDelivery = config.invoice_delivery;

    if (!invoiceDelivery?.url) {
      return res.status(200).json({ delivered: false, reason: 'No invoice delivery URL configured' });
    }

    // Fetch the invoice
    const invoiceSnap = await db.collection('invoices')
      .where('session_id', '==', session_id)
      .limit(1)
      .get();

    let invoiceData: any = null;
    if (!invoiceSnap.empty) {
      invoiceData = { id: invoiceSnap.docs[0].id, ...invoiceSnap.docs[0].data() };
    }

    // Build the payload
    const payload = {
      session_id,
      session_code: sessionData.session_code,
      invoice: invoiceData,
      mart: { id: martDoc.id, name: martData.name },
      delivered_at: new Date().toISOString(),
    };

    // Deliver via webhook
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(invoiceDelivery.headers || {}),
    };

    const webhookRes = await fetch(invoiceDelivery.url, {
      method: invoiceDelivery.method || 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    return res.status(200).json({
      delivered: webhookRes.ok,
      status: webhookRes.status,
    });
  } catch (err: any) {
    console.error('deliver-invoice error:', err);
    // Best-effort — don't fail the entire flow
    return res.status(200).json({ delivered: false, error: err.message });
  }
}
