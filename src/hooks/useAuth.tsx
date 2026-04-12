import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { auth, db } from '@/integrations/firebase/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged, 
  updateProfile as firebaseUpdateProfile,
  type User 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
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

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!mountedRef.current) return;
      
      setUser(currentUser);

      if (currentUser) {
        setLoading(true);
        loadUserData(currentUser.uid).then(() => {
          if (mountedRef.current) setLoading(false);
        });
      } else {
        currentUserIdRef.current = null;
        setProfile(null);
        setRoles([]);
        setLoading(false);
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
      
      const uid = userCredential.user.uid;
      
      // Create profile document in Firestore (no Cloud Functions on Spark Plan)
      await setDoc(doc(db, 'profiles', uid), {
        display_name: displayName,
        email: email,
        avatar_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Assign default 'customer' role
      await setDoc(doc(db, 'user_roles', `${uid}_customer`), {
        user_id: uid,
        role: 'customer',
        assigned_at: new Date().toISOString(),
      });

      return { error: null };
    } catch (error: any) {
      return { error };
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

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider value={{
      user, profile, roles, loading,
      signUp, signIn, signOut, updateProfile, hasRole, refreshRoles,
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