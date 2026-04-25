import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, getAdminDb } from './_lib/firebaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const { email, displayName } = req.body || {};

    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email and displayName are required' });
    }

    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    // Verify token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 minutes

    // Save OTP to Firestore (Admin SDK bypasses rules)
    await db.collection('otps').doc(uid).set({
      otp,
      expiresAt,
      createdAt: new Date().toISOString()
    });

    // Return OTP to frontend so it can send via browser EmailJS
    return res.status(200).json({ success: true, otp, expiresAt });
  } catch (err: any) {
    console.error('generate-otp error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
