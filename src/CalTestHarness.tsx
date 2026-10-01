import { CalendarWidget } from '@/components/CalendarWidget';
export default function CalTestHarness() {
  return (
    <div className="flex gap-6 p-4 bg-background min-h-screen items-start">
      {[200, 240, 300].map(w => (
        <div key={w} style={{ width: w }} className="grid grid-cols-1"><div className="min-w-0"><CalendarWidget /></div></div>
      ))}
    </div>
  );
}
