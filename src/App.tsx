import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import CustomerDashboard from "./pages/CustomerDashboard";
import CustomerScan from "./pages/CustomerScan";
import CashierDashboard from "./pages/CashierDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import MyBills from "./pages/MyBills";
import ExitScan from "./pages/ExitScan";
import RegisterMart from "./pages/RegisterMart";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/scan" element={
              <ProtectedRoute>
                <CustomerScan />
              </ProtectedRoute>
            } />
            <Route path="/cashier" element={
              <ProtectedRoute requiredRole="cashier">
                <CashierDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/bills" element={
              <ProtectedRoute>
                <MyBills />
              </ProtectedRoute>
            } />
            <Route path="/exit-scan" element={
              <ProtectedRoute requiredRole="cashier">
                <ExitScan />
              </ProtectedRoute>
            } />
            <Route path="/register-mart" element={
              <ProtectedRoute>
                <RegisterMart />
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
