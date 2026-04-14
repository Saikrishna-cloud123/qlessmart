import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'customer' | 'cashier' | 'admin' | 'exit_guard';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  // 1. Must be logged in
  if (!user) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  // 2. Must be verified
  if (!user.emailVerified && location.pathname !== '/verify-email') {
    return <Navigate to="/verify-email" replace />;
  }

  // 3. Role-based overrides
  if (hasRole('admin') && location.pathname === '/dashboard') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // 4. Role-based access
  if (requiredRole && !hasRole(requiredRole)) {
    // If user is already on a dashboard they aren't authorized for, redirect them to their primary dashboard
    if (hasRole('admin') && location.pathname !== '/admin/dashboard') return <Navigate to="/admin/dashboard" replace />;
    if (hasRole('cashier') && location.pathname !== '/cashier/dashboard') return <Navigate to="/cashier/dashboard" replace />;
    if (hasRole('exit_guard') && location.pathname !== '/exit-scan') return <Navigate to="/exit-scan" replace />;
    
    // Fallback for customers or users with no specific role document yet
    if (location.pathname !== '/dashboard') {
      return <Navigate to="/dashboard" replace />;
    } else {
      // If we are ALREADY on /dashboard and still lack permissions, something is wrong with the role initialization
      // We'll show a fallback message or just go back to home to avoid a loop
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
