import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { auth, db } from '@/integrations/firebase/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  updateProfile as firebaseUpdateProfile,
  sendEmailVerification,
  reload,
  GoogleAuthProvider,
  signInWithPopup,
  type User 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import type { Profile, AppRole } from '@/integrations/firebase/types';


interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>;
  hasRole: (role: AppRole) => boolean;
  refreshRoles: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sendVerificationEmail: () => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(null);

  const loadUserData = useCallback(async (userId: string) => {
    currentUserIdRef.current = userId;

    try {
      const profileDocRef = doc(db, 'profiles', userId);
      const rolesQuery = query(collection(db, 'user_roles'), where('user_id', '==', userId));

      const [profileResult, rolesResult] = await Promise.all([
        getDoc(profileDocRef),
        getDocs(rolesQuery),
      ]);

      if (!mountedRef.current || currentUserIdRef.current !== userId) return;

      if (profileResult.exists()) {
        setProfile({ id: profileResult.id, ...profileResult.data() } as Profile);
      }
      
      const userRoles = rolesResult.docs.map(d => (d.data() as any).role as AppRole);
      setRoles(userRoles);
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }, []);

  const refreshRoles = useCallback(async () => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    try {
      const rolesQuery = query(collection(db, 'user_roles'), where('user_id', '==', uid));
      const rolesResult = await getDocs(rolesQuery);
      if (mountedRef.current) {
        setRoles(rolesResult.docs.map(d => (d.data() as any).role as AppRole));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!mountedRef.current) return;
      
      try {
        if (currentUser) {
          setLoading(true);
          setUser(currentUser);
          
          // Check if verified user needs profile/role creation
          if (currentUser.emailVerified) {
            const profileDocRef = doc(db, 'profiles', currentUser.uid);
            const snap = await getDoc(profileDocRef);
            
            if (!snap.exists()) {
              // First time login after verification - Create Firestore docs
              try {
                await setDoc(doc(db, 'profiles', currentUser.uid), {
                  display_name: currentUser.displayName || 'Shopper',
                  email: currentUser.email,
                  avatar_url: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
                
                // Default customer role
                await setDoc(doc(db, 'user_roles', `${currentUser.uid}_customer`), {
                  user_id: currentUser.uid,
                  role: 'customer',
                  assigned_at: new Date().toISOString(),
                });
              } catch (e) {
                console.error("Auto-initialization failed:", e);
              }
            }

            // Server-side role sync (uses admin SDK to bypass Firestore rules)
            try {
              const idToken = await currentUser.getIdToken();
              console.log("[Auth] Syncing roles via API...");
              const syncRes = await fetch('/api/sync-user-roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
              });
              if (syncRes.ok) {
                const contentType = syncRes.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                  const syncData = await syncRes.json();
                  console.log("[Auth] Role sync success:", syncData.roles);
                } else {
                  console.warn("[Auth] Role sync returned success but no JSON body");
                }
              } else {
                const errorText = await syncRes.text().catch(() => "Unknown error");
                console.error("[Auth] Role sync failed:", errorText);
              }
            } catch (syncErr) {
              console.error("[Auth] Role sync API error:", syncErr);
            }

            await loadUserData(currentUser.uid);
          } else {
            // Unverified user - clear profile/roles to prevent access
            setProfile(null);
            setRoles([]);
          }
        } else {
          currentUserIdRef.current = null;
          setUser(null);
          setProfile(null);
          setRoles([]);
        }
      } catch (error) {
        console.error("Auth state change error:", error);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [loadUserData]);

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await firebaseUpdateProfile(userCredential.user, { displayName });
      
      // Call backend to generate OTP and save to Firestore securely
      const idToken = await userCredential.user.getIdToken();
      const res = await fetch('/api/generate-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ email, displayName })
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("Failed to generate OTP via backend:", data.error);
      } else {
        // Send OTP email from browser via EmailJS (avoids non-browser 403)
        const { otp, expiresAt } = await res.json();
        const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
        const templateId = import.meta.env.VITE_EMAILJS_VERIFY_TEMPLATE_ID;
        const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

        if (serviceId && templateId && publicKey) {
          await emailjs.send(serviceId, templateId, {
            to_email: email,
            to_name: displayName,
            passcode: otp,
            time: new Date(expiresAt).toLocaleTimeString(),
            reply_to: 'no-reply@qlessmart.com',
          }, publicKey);
          console.log('OTP email sent successfully to:', email);
        }
      }

      return { error: null };
    } catch (error: any) {
      console.error("Signup/Verification Error:", error);
      return { error };
    }
  };

  const sendVerificationEmail = async () => {
    if (!user) return { error: { message: "No user logged in" } };
    try {
      await sendEmailVerification(user);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const refreshUser = async () => {
    if (!auth.currentUser) return;
    try {
      await reload(auth.currentUser);
      const updatedUser = { ...auth.currentUser };
      setUser(updatedUser as any);
      if (updatedUser.emailVerified && !profile) {
        await loadUserData(updatedUser.uid);
      }
    } catch (error) {
      console.error("Error refreshing user:", error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      currentUserIdRef.current = null;
      setUser(null);
      setProfile(null);
      setRoles([]);
    } catch (error) {
      console.error(error);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: { message: 'Not authenticated' } };
    try {
      const profileDocRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileDocRef, updates);
      setProfile(prev => prev ? { ...prev, ...updates } : null);
      if (updates.display_name) {
        await firebaseUpdateProfile(user, { displayName: updates.display_name });
      }
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      return { error: null };
    } catch (error: any) {
      console.error("Google Sign-In Error:", error);
      return { error };
    }
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider value={{
      user, profile, roles, loading,
      signUp, signIn, signOut, updateProfile, hasRole, refreshRoles, refreshUser, sendVerificationEmail, signInWithGoogle
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}