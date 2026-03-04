import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, Copy, RefreshCw, Smile, Meh, Frown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface TicketAIAnalysisProps {
  ticket: { title: string; description: string };
  messages: { sender_type: string; body: string; is_internal: boolean }[];
  onInsertResponse?: (text: string) => void;
}

interface Analysis {
  sentiment: string;
  suggested_priority: string;
  category: string;
  keywords: string[];
  suggested_response: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-primary text-primary-foreground',
  high: 'bg-orange-500 text-white',
  critical: 'bg-destructive text-destructive-foreground',
};

const SENTIMENT_ICONS: Record<string, typeof Smile> = {
  Positiv: Smile, Neutral: Meh, Negativ: Frown, Frustriert: AlertTriangle,
};

export function TicketAIAnalysis({ ticket, messages, onInsertResponse }: TicketAIAnalysisProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-ticket', {
        body: {
          title: ticket.title,
          description: ticket.description,
          messages: messages.filter(m => !m.is_internal),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalysis(data);
    } catch (err: any) {
      toast.error(err.message || 'Analyse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const SentimentIcon = analysis ? (SENTIMENT_ICONS[analysis.sentiment] || Meh) : Meh;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          KI-Analyse
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!analysis && !loading && (
          <div className="text-center py-4">
            <Button variant="outline" size="sm" onClick={analyze}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />Ticket analysieren
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Wird analysiert...</span>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Stimmung</span>
              <Badge variant="outline" className="text-[10px] gap-1">
                <SentimentIcon className="h-3 w-3" />{analysis.sentiment}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Empfohlene Priorität</span>
              <Badge className={`text-[10px] ${PRIORITY_COLORS[analysis.suggested_priority] || ''}`}>
                {PRIORITY_LABELS[analysis.suggested_priority] || analysis.suggested_priority}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Kategorie</span>
              <Badge variant="secondary" className="text-[10px]">{analysis.category}</Badge>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Schlüsselwörter</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.keywords.map(kw => (
                  <Badge key={kw} variant="outline" className="text-[9px] px-1.5 py-0">{kw}</Badge>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Vorgeschlagene Antwort</span>
              <blockquote className="mt-1.5 text-xs italic text-foreground/80 bg-muted rounded-md p-3">
                "{analysis.suggested_response}"
              </blockquote>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => {
                  navigator.clipboard.writeText(analysis.suggested_response);
                  toast.success('Kopiert');
                }}>
                  <Copy className="h-3 w-3 mr-1" />Kopieren
                </Button>
                {onInsertResponse && (
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => onInsertResponse(analysis.suggested_response)}>
                    Einfügen
                  </Button>
                )}
              </div>
            </div>

            <div className="text-center pt-1">
              <Button variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground" onClick={analyze}>
                <RefreshCw className="h-3 w-3 mr-1" />Erneut analysieren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
