import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminDb } from './_lib/firebaseAdmin';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';

// Static role mappings - email -> role (for admin accounts)
const staticRoleMappings: Record<string, string> = {
  "bunnybhokre123@gmail.com": "admin",
};

/**
 * POST /api/sync-user-roles
 * Body: { idToken: string }
 *
 * Verifies the user's Firebase ID token, then strictly syncs
 * their Firestore roles based on:
 *   1. Static role mappings (hardcoded admin emails)
 *   2. Dynamic employee records in Firestore (cashier/exit_guard added by admin)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { idToken } = req.body || {};

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Verify the token using Firebase Admin
    const db = getAdminDb();
    const adminAuth = getAuth(getApps()[0]);
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase();

    console.log(`[sync-user-roles] Syncing roles for ${email} (uid: ${uid})`);

    // 1. Check static mappings (admin accounts)
    const staticEntry = Object.entries(staticRoleMappings).find(
      ([mappedEmail]) => mappedEmail.toLowerCase() === email
    );
    const staticRole = staticEntry ? staticEntry[1] : null;

    // 2. Check employees collection (cashier/exit_guard added by admin)
    let employeeRole: string | null = null;
    const employeesSnap = await db.collection('employees')
      .where('email', '==', email)
      .where('is_active', '==', true)
      .limit(1)
      .get();

    if (!employeesSnap.empty) {
      const empData = employeesSnap.docs[0].data();
      employeeRole = empData.role || null;
      console.log(`[sync-user-roles] Found active employee record with role: ${employeeRole}`);
    }

    // Determine final allowed roles (static takes priority, then employee)
    const assignedRole = staticRole || employeeRole;
    const allowedRoles = assignedRole ? ['customer', assignedRole] : ['customer'];

    console.log(`[sync-user-roles] Allowed roles: ${allowedRoles.join(', ')}`);

    // Get current roles from Firestore
    const rolesSnap = await db.collection('user_roles')
      .where('user_id', '==', uid)
      .get();

    const currentRoles = rolesSnap.docs.map(d => ({ id: d.id, role: d.data().role as string }));
    console.log(`[sync-user-roles] Current DB roles: ${currentRoles.map(r => r.role).join(', ')}`);

    // Delete roles that shouldn't exist
    for (const r of currentRoles) {
      if (!allowedRoles.includes(r.role)) {
        console.log(`[sync-user-roles] Removing unauthorized role: ${r.role}`);
        await db.collection('user_roles').doc(r.id).delete();
      }
    }

    // Add missing roles
    for (const role of allowedRoles) {
      if (!currentRoles.find(cr => cr.role === role)) {
        console.log(`[sync-user-roles] Adding missing role: ${role}`);
        await db.collection('user_roles').doc(`${uid}_${role}`).set({
          user_id: uid,
          role,
          assigned_at: new Date().toISOString(),
        });
      }
    }

    // Also update the employee record with user_id if it doesn't have one
    if (!employeesSnap.empty) {
      const empDoc = employeesSnap.docs[0];
      if (!empDoc.data().user_id) {
        await db.collection('employees').doc(empDoc.id).update({ user_id: uid });
      }
    }

    return res.status(200).json({ success: true, roles: allowedRoles });
  } catch (err: unknown) {
    console.error('[sync-user-roles] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage, success: false });
  }
}
