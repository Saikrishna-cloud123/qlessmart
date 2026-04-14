import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb } from './_lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/decrement-stock
 * Body: { items: Array<{ barcode: string, quantity: number }> }
 *
 * Atomically decrements the stock count for the provided items.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Valid items array is required' });
    }

    const db = getAdminDb();
    const batch = db.batch();
    
    let processCount = 0;

    for (const item of items) {
      if (item.barcode && typeof item.quantity === 'number' && item.quantity > 0) {
        const productRef = db.collection('products').doc(item.barcode);
        // Using set with merge: true ensures that even if this is a dummy/demo product
        // it gracefully initializes its stock negative count instead of crashing with NOT_FOUND.
        batch.set(
          productRef, 
          { stock: FieldValue.increment(-item.quantity) },
          { merge: true }
        );
        processCount++;
      }
    }

    if (processCount > 0) {
      await batch.commit();
    }

    return res.status(200).json({ success: true, processed: processCount });
  } catch (err: unknown) {
    console.error('decrement-stock error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage, success: false });
  }
}
