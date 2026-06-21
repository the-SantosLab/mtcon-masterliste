import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MtiqTablet } from '@/components/mtiq/MtiqTablet';
import { AppLayout } from '@/components/AppLayout';

export default function MtiqTabletPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return null;
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4">
        <button onClick={() => navigate(-1)} className="text-xs flex items-center gap-1 mb-3 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Zurück
        </button>
        <div className="rounded-xl overflow-hidden" style={{ background: '#111', border: '1px solid #222', minHeight: 600 }}>
          <MtiqTablet tabletId={id} />
        </div>
      </div>
    </AppLayout>
  );
}
