import AcquisitionWorkspace from '@/components/crm/AcquisitionWorkspace';
import type { AcquisitionKey } from '@/lib/acquisition';

export default function CrmAcquisitionPage({ channel }: { channel: AcquisitionKey }) {
  return <AcquisitionWorkspace channel={channel} />;
}