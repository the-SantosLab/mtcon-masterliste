import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import Inbox from './Inbox';
import MtiqDrafts from './MtiqDrafts';

type TabKey = 'documents' | 'mtiq';

export default function InboxHub() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get('tab') as TabKey) || 'documents';

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
      <div className="flex flex-col h-full">
        <Tabs value={initial} onValueChange={onChange} className="flex flex-col h-full">
          <div className="px-4 md:px-6 pt-4 border-b border-border dark:border-white/5">
            <TabsList>
              <TabsTrigger value="documents">Dokumente (Intelligent Inbox)</TabsTrigger>
              <TabsTrigger value="mtiq">MTIQ Posteingang</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="documents" className="flex-1 overflow-auto mt-0">
            <Inbox embedded />
          </TabsContent>
          <TabsContent value="mtiq" className="flex-1 overflow-hidden mt-0">
            <MtiqDrafts embedded />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
