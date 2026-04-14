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
    
    // Fetch session data
    const sessionDoc = await db.collection('sessions').doc(session_id).get();
    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found', success: false });
    }
    const sessionData = sessionDoc.data()!;
    const now = new Date().toISOString();

    await db.collection('sessions').doc(session_id).update({
      state: 'PAID',
      payment_method: 'razorpay',
      razorpay_order_id,
      razorpay_payment_id,
      paid_at: now,
      updated_at: now,
    });

    // Fetch cart items to generate Invoice
    const cartItemsSnap = await db.collection('cart_items')
      .where('session_id', '==', session_id)
      .get();
    
    const items = cartItemsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        barcode: data.barcode || '',
        title: data.title || 'Item',
        price: data.price || 0,
        quantity: data.quantity || 1,
        image_url: data.image_url || null,
        brand: data.brand || null,
        category: data.category || null,
      };
    });
    const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);

    // Create Invoice
    await db.collection('invoices').add({
      session_id,
      mart_id: sessionData.mart_id,
      branch_id: sessionData.branch_id || null,
      user_id: sessionData.user_id,
      invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
      items,
      total_amount: sessionData.total_amount || 0,
      total_quantity: totalQty,
      payment_method: 'razorpay',
      created_at: now,
    });

    // Add audit log
    await db.collection('audit_logs').add({
      action: 'RAZORPAY_PAYMENT_VERIFIED',
      session_id,
      details: { razorpay_order_id, razorpay_payment_id },
      created_at: now,
    });

    // Try to trigger webhook (best-effort)
    const host = req.headers.host || 'qlessmart.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    fetch(`${protocol}://${host}/api/deliver-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id })
    }).catch(e => console.error("Webhook deliver trigger failed:", e));

    // Decrement stock
    fetch(`${protocol}://${host}/api/decrement-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    }).catch(e => console.error("Stock decrement trigger failed:", e));

    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    console.error('verify-razorpay-payment error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage, success: false });
  }
}
