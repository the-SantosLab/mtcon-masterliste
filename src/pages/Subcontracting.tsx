import { AppLayout } from '@/components/AppLayout';
import { SubcontractOrders } from '@/components/erp/SubcontractOrders';

export default function Subcontracting() {
  return <AppLayout><div className="space-y-4 max-w-[1400px]"><h1 className="text-lg font-semibold">Fremdbearbeitungsaufträge</h1><SubcontractOrders /></div></AppLayout>;
}