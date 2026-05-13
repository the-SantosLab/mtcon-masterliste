import { CrmLayout } from '@/components/CrmLayout';

export default function CrmStub({ title }: { title: string }) {
  return (
    <CrmLayout>
      <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">In Vorbereitung.</p>
    </CrmLayout>
  );
}
