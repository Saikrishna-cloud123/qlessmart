import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb } from './_lib/firebaseAdmin';

/**
 * POST /api/inventory-lookup
 * Body: { barcode: string, branch_id: string }
 *
 * Looks up the branch's inventory_api_url, calls it with the barcode,
 * and returns the product data. Falls back to demo products if no
 * API URL is configured.
 */

const DEMO_PRODUCTS: Record<string, any> = {
  '8901234567890': {
    barcode: '8901234567890', title: 'Milk 1L', brand: 'Amul',
    category: 'Dairy', price: 60, image_url: null,
  },
  '8901234567891': {
    barcode: '8901234567891', title: 'Bread (White)', brand: 'Harvest Gold',
    category: 'Bakery', price: 45, image_url: null,
  },
  '8901234567892': {
    barcode: '8901234567892', title: 'Rice 5kg', brand: 'India Gate',
    category: 'Grains', price: 380, image_url: null,
  },
  '8901234567893': {
    barcode: '8901234567893', title: 'Cooking Oil 1L', brand: 'Fortune',
    category: 'Cooking', price: 155, image_url: null,
  },
  '8901234567894': {
    barcode: '8901234567894', title: 'Sugar 1kg', brand: 'Dhampure',
    category: 'Essentials', price: 48, image_url: null,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { barcode, branch_id } = req.body || {};
    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required' });
    }

    let inventoryApiUrl: string | null = null;

    // If we have a branch_id, look up the branch's inventory API URL
    if (branch_id) {
      const db = getAdminDb();
      const branchDoc = await db.collection('branches').doc(branch_id).get();
      if (branchDoc.exists) {
        inventoryApiUrl = branchDoc.data()?.inventory_api_url || null;
      }
    }

    // If external inventory API is configured, call it
    if (inventoryApiUrl) {
      const url = inventoryApiUrl.replace('{barcode}', encodeURIComponent(barcode));
      const apiRes = await fetch(url);
      if (apiRes.ok) {
        const data = await apiRes.json();
        // Normalize: expect { product: {...} } or just the product object
        const product = data?.product || data;
        return res.status(200).json({ product });
      }
      return res.status(404).json({ error: 'Product not found in external API' });
    }

    // Fallback: demo products
    const demo = DEMO_PRODUCTS[barcode];
    if (demo) {
      return res.status(200).json({ product: demo });
    }

    // Generate a random demo product for any unknown barcode
    return res.status(200).json({
      product: {
        barcode,
        title: `Product ${barcode.slice(-4)}`,
        brand: 'Generic',
        category: 'General',
        price: Math.round((Math.random() * 500 + 10) * 100) / 100,
        image_url: null,
      },
    });
  } catch (err: any) {
    console.error('inventory-lookup error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
