import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * POST /api/create-razorpay-order
 * Body: { session_id: string, amount: number }
 *
 * Creates a Razorpay order using the test keys from environment variables.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id, amount } = req.body || {};

    if (!session_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'session_id and a positive amount are required' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({ error: 'Razorpay keys not configured' });
    }

    // Amount in paise (Razorpay expects smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `session_${session_id}`,
        notes: { session_id },
      }),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      console.error('Razorpay order creation failed:', orderData);
      return res.status(500).json({ error: orderData?.error?.description || 'Failed to create order' });
    }

    return res.status(200).json({
      order_id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      key_id: keyId, // frontend needs this to open checkout
    });
  } catch (err: any) {
    console.error('create-razorpay-order error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
