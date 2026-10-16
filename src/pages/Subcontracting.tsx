import { FulfillmentHeader, FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
import { AppLayout } from '@/components/AppLayout';
import { SubcontractOrders } from '@/components/erp/SubcontractOrders';

export default function Subcontracting() {
  return <AppLayout><div className="fulfillment-page"><FulfillmentHeader title="Fremdbearbeitung" subtitle="Externe Bearbeitung · Materialausgabe · Rücklieferung" /><SubcontractOrders /></div></AppLayout>;
}