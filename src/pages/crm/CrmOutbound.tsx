import { Navigate, useSearchParams } from 'react-router-dom';
import AcquisitionWorkspace from '@/components/crm/AcquisitionWorkspace';

export default function CrmOutbound() {
  const [params] = useSearchParams();
  if (params.get('tab') === 'campaigns' || params.get('tab') === 'sequences') return <Navigate to="/crm/outbound/campaigns" replace />;
  if (params.get('tab') === 'contacts') return <Navigate to="/crm/outbound/enrollments" replace />;
  return <AcquisitionWorkspace />;
}
