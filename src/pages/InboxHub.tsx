import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Inbox from './Inbox';
import MtiqDrafts from './MtiqDrafts';

type TabKey = 'documents' | 'mtiq';

export default function InboxHub() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const fromPath: TabKey | null = pathname.startsWith('/mtiq') ? 'mtiq' : null;
  const initial: TabKey = (params.get('tab') as TabKey) || fromPath || 'documents';

  useEffect(() => {
    if (!params.get('tab')) {
      const next = new URLSearchParams(params);
      next.set('tab', initial);
      setParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 -m-3 sm:-m-5 lg:-m-8">
        <Tabs value={initial} onValueChange={onChange} className="flex flex-col h-full min-h-0">
          <div className="px-4 md:px-6 pt-4 border-b border-border dark:border-white/5 shrink-0">
            <TabsList>
              <TabsTrigger value="documents">Dokumente (Intelligent Inbox)</TabsTrigger>
              <TabsTrigger value="mtiq">MTIQ Posteingang</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="documents" className="flex-1 min-h-0 overflow-auto mt-0 p-3 sm:p-5 lg:p-8">
            <Inbox embedded />
          </TabsContent>
          <TabsContent value="mtiq" className="flex-1 min-h-0 overflow-hidden mt-0 data-[state=active]:flex flex-col">
            <MtiqDrafts embedded />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
