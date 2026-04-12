import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { getAdminDb } from './_lib/firebaseAdmin';

/**
 * POST /api/verify-razorpay-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, session_id }
 *
 * Verifies the Razorpay payment signature and updates the session state to PAID.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, session_id } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !session_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return res.status(500).json({ error: 'Razorpay secret not configured' });
    }

    // Verify signature: HMAC SHA256 of order_id|payment_id with key_secret
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature', success: false });
    }

    // Update session state to PAID in Firestore
    const db = getAdminDb();
    await db.collection('sessions').doc(session_id).update({
      state: 'PAID',
      payment_method: 'razorpay',
      razorpay_order_id,
      razorpay_payment_id,
      paid_at: new Date().toISOString(),
    });

    // Add audit log
    await db.collection('audit_logs').add({
      action: 'RAZORPAY_PAYMENT_VERIFIED',
      session_id,
      details: { razorpay_order_id, razorpay_payment_id },
      created_at: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('verify-razorpay-payment error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error', success: false });
  }
}
