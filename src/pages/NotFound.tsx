import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-5xl font-semibold text-foreground mb-2">404</p>
        <p className="text-sm text-muted-foreground mb-6">Seite nicht gefunden</p>
        <a href="/" className="text-xs text-primary hover:underline">
          Zurück zum Dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
