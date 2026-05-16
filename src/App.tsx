import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/OfflineBanner";
import { InstallAppBanner } from "@/components/InstallAppBanner";

const Login = lazy(() => import("./pages/Login.tsx"));
const Index = lazy(() => import("./pages/Index.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function RouteFallback() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground/60" aria-hidden />
    </div>
  );
}

function RoutedViews() {
  const location = useLocation();
  return (
    <Suspense fallback={<RouteFallback />}>
      <div
        key={location.pathname}
        className={cn(
          "min-h-dvh",
          "motion-reduce:animate-none",
          "animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out",
        )}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/settings" element={<Navigate to="/?settings=household" replace />} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Suspense>
  );
}

function AppChrome() {
  const online = useOnlineStatus();
  return (
    <>
      <OfflineBanner online={online} className="relative z-[100]" />
      <RoutedViews />
    </>
  );
}

const App = () => (
  <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppChrome />
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
