import { AppLayout } from '@/components/AppLayout';

/**
 * CRM ist vollständig in die Masterliste integriert. Diese Komponente bleibt
 * nur als Wrapper bestehen, damit bestehende CRM-Seiten unverändert die
 * Masterliste-Sidebar (AppLayout) verwenden.
 */
export function CrmLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
