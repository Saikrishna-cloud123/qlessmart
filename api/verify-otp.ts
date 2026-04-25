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
    const { otp } = req.body || {};

    if (!otp) {
      return res.status(400).json({ error: 'OTP is required' });
    }

    const adminAuth = getAdminAuth();
    const db = getAdminDb();

    // Verify token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Fetch OTP document
    const otpDoc = await db.collection('otps').doc(uid).get();
    if (!otpDoc.exists) {
      return res.status(400).json({ error: 'No OTP found or it has expired' });
    }

    const otpData = otpDoc.data()!;
    
    // Check if expired (assuming expiresAt is ISO string)
    const now = new Date();
    if (otpData.expiresAt && new Date(otpData.expiresAt) < now) {
      await db.collection('otps').doc(uid).delete(); // Cleanup
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Verify OTP
    if (otpData.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Update user to verified
    await adminAuth.updateUser(uid, {
      emailVerified: true
    });

    // Clean up OTP doc
    await db.collection('otps').doc(uid).delete();

    return res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (err: any) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
