import { useEffect, useState, ReactNode } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  detectImportType,
  readXlsx,
  runImport,
  IMPORT_TYPE_LABEL,
  type ImportType,
  type Row,
} from '@/lib/article-import';
import { StockLocationsTable } from '@/components/articles/StockLocationsTable';

type Pending = {
  file: File;
  type: ImportType;
  rows: Row[];
  headers: string[];
};

export default function AdminArticles() {
  const { isAdmin, loading } = useAuth();
  const [detailArtNr, setDetailArtNr] = useState<string | null>(null);
  if (!loading && !isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1400px]">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Artikelverwaltung (ISSOS)</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            ISSOS-Artikelstruktur 1:1 in der MSL — Stamm, Kunden, Lieferanten, Preise, Stücklisten, Sachmerkmale
          </p>
        </div>
        <Tabs defaultValue="articles">
          <TabsList className="bg-secondary flex-wrap h-auto">
            <TabsTrigger value="articles" className="text-xs">Artikelstamm</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs">Kundenartikel</TabsTrigger>
            <TabsTrigger value="suppliers" className="text-xs">Lieferantenartikel</TabsTrigger>
            <TabsTrigger value="pricelist" className="text-xs">Artikelpreisliste</TabsTrigger>
            <TabsTrigger value="bom" className="text-xs">Stückliste</TabsTrigger>
            <TabsTrigger value="attributes" className="text-xs">Sachmerkmale</TabsTrigger>
            <TabsTrigger value="status90" className="text-xs">Status90</TabsTrigger>
            <TabsTrigger value="prices" className="text-xs">Artikelpreise</TabsTrigger>
            <TabsTrigger value="stock" className="text-xs">Lagerorte</TabsTrigger>
            <TabsTrigger value="import" className="text-xs">Import</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Import-Log</TabsTrigger>
          </TabsList>
          <TabsContent value="articles"><ArticlesTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="customers"><CustomerRefsTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="suppliers"><SupplierRefsTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="pricelist"><PriceListTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="bom"><BomTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="attributes"><AttributesTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="status90"><Status90Tab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="prices"><PricesTab onOpen={setDetailArtNr} /></TabsContent>
          <TabsContent value="stock" className="pt-4"><StockLocationsTable globalSearchableArtNr showSummary={false} /></TabsContent>
          <TabsContent value="import"><ImportTab /></TabsContent>
          <TabsContent value="history"><HistoryTab /></TabsContent>
        </Tabs>
      </div>
      <ArticleDetailDialog artNr={detailArtNr} onClose={() => setDetailArtNr(null)} />
    </AppLayout>
  );
}

// ---------------- Generic paginated browser ----------------
interface BrowserProps {
  table: string;
  select: string;
  orderBy: string;
  searchableCols: string[];
  searchPlaceholder: string;
  columns: { key: string; label: string; render?: (r: any) => ReactNode; className?: string }[];
  onRowClick?: (row: any) => void;
  filter?: (q: any) => any;
}

function PaginatedBrowser({
  table, select, orderBy, searchableCols, searchPlaceholder, columns, onRowClick, filter,
}: BrowserProps) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<string>(orderBy);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const { preferences } = usePreferences();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(1); }, [q, pageSize, sortKey, sortAsc]);
  useEffect(() => { setSortKey(orderBy); setSortAsc(true); }, [orderBy, table]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const run = async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let base: any = (supabase as any)
        .from(table)
        .select(select, { count: 'exact' })
        .order(sortKey, { ascending: sortAsc, nullsFirst: false })
        .range(from, to);
      if (filter) base = filter(base);
      if (q.trim() && searchableCols.length) {
        const t = q.trim();
        base = base.or(searchableCols.map((c) => `${c}.ilike.%${t}%`).join(','));
      }
      const { data, error, count } = await base;
      if (!cancel) {
        if (error) toast.error(error.message);
        setRows(data ?? []);
        setTotal(count ?? 0);
        setLoading(false);
      }
    };
    const t = setTimeout(run, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, page, pageSize, table, select, sortKey, sortAsc]);

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  return (
    <div className="space-y-3 pt-4">
      <div className="relative max-w-md">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 text-xs pl-8"
        />
      </div>
      <div className="rounded-md border border-border bg-card overflow-auto max-h-[calc(100vh-220px)]">
        <table className={`w-full caption-bottom text-sm ${preferences.compactTables ? 'table-compact' : ''}`}>
          <thead className="[&_tr]:border-b">
            <tr className="border-b">
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`sticky top-0 z-20 text-left align-middle font-medium text-muted-foreground bg-card backdrop-blur-sm shadow-[inset_0_-1px_0_0_hsl(var(--border))] cursor-pointer select-none hover:text-foreground transition-colors ${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} ${c.className ?? ''}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      <span className={`text-[8px] ${active ? 'opacity-100 text-foreground' : 'opacity-30'}`}>
                        {active ? (sortAsc ? '▲' : '▼') : '↕'}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {loading && (
              <tr className="border-b"><td colSpan={columns.length} className={`${preferences.compactTables ? 'text-[10px] py-3' : 'text-xs py-6'} text-center text-muted-foreground align-middle`}>Lade…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr className="border-b"><td colSpan={columns.length} className={`${preferences.compactTables ? 'text-[10px] py-3' : 'text-xs py-6'} text-center text-muted-foreground align-middle`}>Keine Treffer</td></tr>
            )}
            {!loading && rows.map((r, i) => (
              <tr
                key={i}
                className={`border-b transition-colors hover:bg-muted/50 ${onRowClick ? 'cursor-pointer hover:bg-secondary/40' : ''}`}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`align-middle ${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} ${c.className ?? ''}`}>
                    {c.render ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {total > 0 ? `${startItem}–${endItem} von ${total}` : '0 Treffer'}
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-7 text-[10px] bg-secondary border border-border rounded px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span className="text-[10px] text-muted-foreground">pro Seite</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 text-[10px] px-2"
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Zurück</Button>
          <span className="text-[10px] text-muted-foreground px-2">Seite {page} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 text-[10px] px-2"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>Weiter</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Tab implementations ----------------
function ArticlesTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="articles"
      select="art_nr,matchcode,bezeich_1,bezeich_2,art_gr,mat_art,me,pe,art_stat,zeichnung_nr,is_blocked"
      orderBy="art_nr"
      searchableCols={['art_nr', 'matchcode', 'bezeich_1', 'bezeich_2', 'zeichnung_nr']}
      searchPlaceholder="Suche Art.-Nr, Matchcode, Bezeichnung, Zeichn.-Nr…"
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'matchcode', label: 'Matchcode' },
        { key: 'bezeich_1', label: 'Bezeichnung 1' },
        { key: 'bezeich_2', label: 'Bezeichnung 2', className: 'text-muted-foreground' },
        { key: 'art_gr', label: 'Gruppe', className: 'text-muted-foreground' },
        { key: 'mat_art', label: 'Mat-Art', className: 'text-muted-foreground' },
        { key: 'me', label: 'ME', className: 'text-muted-foreground' },
        { key: 'zeichnung_nr', label: 'Zeichn.-Nr', className: 'text-muted-foreground' },
        {
          key: 'art_stat', label: 'Status',
          render: (r) => r.is_blocked
            ? <Badge variant="destructive" className="text-[10px]">{r.art_stat}</Badge>
            : <Badge variant="secondary" className="text-[10px]">{r.art_stat ?? '—'}</Badge>,
        },
      ]}
    />
  );
}

function CustomerRefsTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="article_customer_refs"
      select="art_nr,kunden_nr,matchcode,art_kunde,bez_kunde,la_preis,me,version_nr"
      orderBy="art_nr"
      searchableCols={['art_nr', 'kunden_nr', 'matchcode', 'art_kunde', 'bez_kunde']}
      searchPlaceholder="Suche Art.-Nr, Kunden-Nr, Art/Kunde, Bezeichnung…"
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'kunden_nr', label: 'Kunden-Nr' },
        { key: 'matchcode', label: 'Matchcode' },
        { key: 'art_kunde', label: 'Art/Kunde', className: 'font-mono' },
        { key: 'bez_kunde', label: 'Bez. Kunde' },
        { key: 'la_preis', label: 'L-A-Preis', className: 'text-right' },
        { key: 'me', label: 'ME', className: 'text-muted-foreground' },
        { key: 'version_nr', label: 'Version', className: 'text-muted-foreground' },
      ]}
    />
  );
}

function SupplierRefsTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="article_supplier_refs"
      select="art_nr,lief_nr,name_1,art_lief,bez_lief,lb_preis,lieferzeit,bestell_nr"
      orderBy="art_nr"
      searchableCols={['art_nr', 'lief_nr', 'name_1', 'art_lief', 'bez_lief', 'bestell_nr']}
      searchPlaceholder="Suche Art.-Nr, Lief-Nr, Name, Art-Lief…"
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'lief_nr', label: 'Lief-Nr' },
        { key: 'name_1', label: 'Name' },
        { key: 'art_lief', label: 'Art-Lief', className: 'font-mono' },
        { key: 'bez_lief', label: 'Bez. Lieferant' },
        { key: 'lb_preis', label: 'L-B-Preis', className: 'text-right' },
        { key: 'lieferzeit', label: 'Lieferzt.', className: 'text-right text-muted-foreground' },
        { key: 'bestell_nr', label: 'Bestell-Nr', className: 'text-muted-foreground' },
      ]}
    />
  );
}

function PriceListTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="article_price_list_items"
      select="art_nr,prl_nr,bez_pl,menge_von,menge_bis,vk_preis,waehrung,me,rab"
      orderBy="art_nr"
      searchableCols={['art_nr', 'prl_nr', 'bez_pl']}
      searchPlaceholder="Suche Art.-Nr, Preisliste…"
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'prl_nr', label: 'Prl-Nr' },
        { key: 'bez_pl', label: 'Preisliste' },
        { key: 'menge_von', label: 'Von', className: 'text-right' },
        { key: 'menge_bis', label: 'Bis', className: 'text-right' },
        { key: 'vk_preis', label: 'VK-Preis', className: 'text-right' },
        { key: 'waehrung', label: 'Währ.', className: 'text-muted-foreground' },
        { key: 'me', label: 'ME', className: 'text-muted-foreground' },
        { key: 'rab', label: 'Rab.', className: 'text-right text-muted-foreground' },
      ]}
    />
  );
}

function BomTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="article_bom"
      select="parent_art_nr,pos,component_art_nr,component_matchcode,component_bezeichnung,menge,me,ausschuss"
      orderBy="parent_art_nr"
      searchableCols={['parent_art_nr', 'component_art_nr', 'component_matchcode', 'component_bezeichnung']}
      searchPlaceholder="Suche Parent oder Komponente…"
      onRowClick={(r) => onOpen(r.parent_art_nr)}
      columns={[
        { key: 'parent_art_nr', label: 'Parent', className: 'font-mono' },
        { key: 'pos', label: 'Pos', className: 'text-muted-foreground' },
        { key: 'component_art_nr', label: 'Komp. Art.-Nr', className: 'font-mono' },
        { key: 'component_matchcode', label: 'Matchcode' },
        { key: 'component_bezeichnung', label: 'Bezeichnung' },
        { key: 'menge', label: 'Menge', className: 'text-right' },
        { key: 'me', label: 'ME', className: 'text-muted-foreground' },
        { key: 'ausschuss', label: 'Ausschuss', className: 'text-right text-muted-foreground' },
      ]}
    />
  );
}

function AttributesTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="article_attributes"
      select="art_nr,attr_key,attr_label,attr_value"
      orderBy="art_nr"
      searchableCols={['art_nr', 'attr_key', 'attr_value']}
      searchPlaceholder="Suche Art.-Nr, Merkmal, Wert…"
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'attr_key', label: 'Merkmal' },
        { key: 'attr_label', label: 'Label', className: 'text-muted-foreground' },
        { key: 'attr_value', label: 'Wert' },
      ]}
    />
  );
}

function Status90Tab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="articles"
      select="art_nr,matchcode,bezeich_1,art_stat,art_stat_label,is_blocked"
      orderBy="art_nr"
      searchableCols={['art_nr', 'matchcode', 'bezeich_1']}
      searchPlaceholder="Suche gesperrte Artikel…"
      filter={(q) => q.eq('is_blocked', true)}
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'matchcode', label: 'Matchcode' },
        { key: 'bezeich_1', label: 'Bezeichnung' },
        {
          key: 'art_stat', label: 'Status',
          render: (r) => <Badge variant="destructive" className="text-[10px]">{r.art_stat}</Badge>,
        },
        { key: 'art_stat_label', label: 'Bezeichnung Status', className: 'text-muted-foreground' },
      ]}
    />
  );
}

function PricesTab({ onOpen }: { onOpen: (n: string) => void }) {
  return (
    <PaginatedBrowser
      table="article_prices"
      select="art_nr,waehrung,standardpreis,durchschnittspreis,letzter_ep,einkaufspreis,bewertungspreis"
      orderBy="art_nr"
      searchableCols={['art_nr']}
      searchPlaceholder="Suche Art.-Nr…"
      onRowClick={(r) => onOpen(r.art_nr)}
      columns={[
        { key: 'art_nr', label: 'Art.-Nr', className: 'font-mono' },
        { key: 'waehrung', label: 'Währ.', className: 'text-muted-foreground' },
        { key: 'standardpreis', label: 'SP', className: 'text-right' },
        { key: 'durchschnittspreis', label: 'DP', className: 'text-right' },
        { key: 'letzter_ep', label: 'LEP', className: 'text-right' },
        { key: 'einkaufspreis', label: 'EP', className: 'text-right' },
        { key: 'bewertungspreis', label: 'Bewertung', className: 'text-right text-muted-foreground' },
      ]}
    />
  );
}

// ---------------- Article detail dialog ----------------
function ArticleDetailDialog({ artNr, onClose }: { artNr: string | null; onClose: () => void }) {
  const [article, setArticle] = useState<any | null>(null);
  const [attributes, setAttributes] = useState<any[]>([]);
  const [price, setPrice] = useState<any | null>(null);
  const [priceList, setPriceList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [bom, setBom] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artNr) return;
    setLoading(true);
    (async () => {
      const sb: any = supabase;
      const [a, attr, p, pl, c, s, b] = await Promise.all([
        sb.from('articles').select('*').eq('art_nr', artNr).maybeSingle(),
        sb.from('article_attributes').select('*').eq('art_nr', artNr).order('attr_key'),
        sb.from('article_prices').select('*').eq('art_nr', artNr).maybeSingle(),
        sb.from('article_price_list_items').select('*').eq('art_nr', artNr),
        sb.from('article_customer_refs').select('*').eq('art_nr', artNr),
        sb.from('article_supplier_refs').select('*').eq('art_nr', artNr),
        sb.from('article_bom').select('*').eq('parent_art_nr', artNr).order('pos'),
      ]);
      setArticle(a.data);
      setAttributes(attr.data ?? []);
      setPrice(p.data);
      setPriceList(pl.data ?? []);
      setCustomers(c.data ?? []);
      setSuppliers(s.data ?? []);
      setBom(b.data ?? []);
      setLoading(false);
    })();
  }, [artNr]);

  return (
    <Dialog open={!!artNr} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="font-mono">{artNr}</span>
            {article?.matchcode && <span className="text-muted-foreground font-normal">· {article.matchcode}</span>}
            {article?.is_blocked && <Badge variant="destructive" className="text-[10px]">Gesperrt {article.art_stat}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {loading && <div className="text-xs text-muted-foreground py-6 text-center">Lade…</div>}
        {!loading && article && (
          <Tabs defaultValue="stamm">
            <TabsList className="bg-secondary flex-wrap h-auto">
              <TabsTrigger value="stamm" className="text-xs">Stamm</TabsTrigger>
              <TabsTrigger value="attr" className="text-xs">Sachmerkmale ({attributes.length})</TabsTrigger>
              <TabsTrigger value="pr" className="text-xs">Preise</TabsTrigger>
              <TabsTrigger value="pl" className="text-xs">Preisliste ({priceList.length})</TabsTrigger>
              <TabsTrigger value="cust" className="text-xs">Kunden ({customers.length})</TabsTrigger>
              <TabsTrigger value="sup" className="text-xs">Lieferanten ({suppliers.length})</TabsTrigger>
              <TabsTrigger value="bom" className="text-xs">Stückliste ({bom.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="stamm" className="pt-3">
              <DetailGrid data={article} table="articles" pkCol="art_nr" pkVal={artNr!} onSaved={(d) => setArticle(d)} />
            </TabsContent>
            <TabsContent value="attr" className="pt-3">
              <SimpleTable rows={attributes} cols={[
                { k: 'attr_key', l: 'Merkmal' },
                { k: 'attr_label', l: 'Bezeichnung' },
                { k: 'attr_value', l: 'Wert' },
              ]} />
            </TabsContent>
            <TabsContent value="pr" className="pt-3">
              {price
                ? <DetailGrid data={price} table="article_prices" pkCol="art_nr" pkVal={artNr!} onSaved={(d) => setPrice(d)} />
                : <div className="text-xs text-muted-foreground">Keine Preise hinterlegt</div>}
            </TabsContent>

            <TabsContent value="pl" className="pt-3">
              <SimpleTable rows={priceList} cols={[
                { k: 'prl_nr', l: 'Prl-Nr' }, { k: 'bez_pl', l: 'Preisliste' },
                { k: 'menge_von', l: 'Von' }, { k: 'menge_bis', l: 'Bis' },
                { k: 'vk_preis', l: 'VK-Preis' }, { k: 'waehrung', l: 'Währ.' }, { k: 'rab', l: 'Rab.' },
              ]} />
            </TabsContent>
            <TabsContent value="cust" className="pt-3">
              <SimpleTable rows={customers} cols={[
                { k: 'kunden_nr', l: 'Kunden-Nr' }, { k: 'matchcode', l: 'Matchcode' },
                { k: 'art_kunde', l: 'Art/Kunde' }, { k: 'bez_kunde', l: 'Bez. Kunde' },
                { k: 'la_preis', l: 'L-A-Preis' }, { k: 'me', l: 'ME' },
              ]} />
            </TabsContent>
            <TabsContent value="sup" className="pt-3">
              <SimpleTable rows={suppliers} cols={[
                { k: 'lief_nr', l: 'Lief-Nr' }, { k: 'name_1', l: 'Name' },
                { k: 'art_lief', l: 'Art-Lief' }, { k: 'bez_lief', l: 'Bez. Lieferant' },
                { k: 'lb_preis', l: 'L-B-Preis' }, { k: 'lieferzeit', l: 'Lieferzt.' },
                { k: 'bestell_nr', l: 'Bestell-Nr' },
              ]} />
            </TabsContent>
            <TabsContent value="bom" className="pt-3">
              <SimpleTable rows={bom} cols={[
                { k: 'pos', l: 'Pos' }, { k: 'component_art_nr', l: 'Komp. Art.-Nr' },
                { k: 'component_matchcode', l: 'Matchcode' }, { k: 'component_bezeichnung', l: 'Bezeichnung' },
                { k: 'menge', l: 'Menge' }, { k: 'me', l: 'ME' }, { k: 'ausschuss', l: 'Ausschuss' },
              ]} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailGrid({
  data, table, pkCol, pkVal, onSaved,
}: {
  data: Record<string, any>;
  table: string;
  pkCol: string;
  pkVal: string;
  onSaved: (d: any) => void;
}) {
  const { preferences } = usePreferences();
  const { isAdmin } = useAuth();
  const SKIP = ['id', 'created_at', 'updated_at', 'updated_by', 'is_blocked', pkCol];
  const entries = Object.entries(data).filter(([k]) => !SKIP.includes(k));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    const f: Record<string, any> = {};
    for (const [k, v] of entries) f[k] = v ?? '';
    setForm(f);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(form)) {
      const original = (data as any)[k] ?? '';
      if (String(v ?? '') !== String(original)) {
        patch[k] = v === '' ? null : v;
      }
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false); setSaving(false); return;
    }
    const { data: updated, error } = await (supabase as any)
      .from(table).update(patch).eq(pkCol, pkVal).select('*').maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${Object.keys(patch).length} Feld(er) gespeichert`);
    onSaved(updated);
    setEditing(false);
  };

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end gap-2">
          {!editing ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={startEdit}>Bearbeiten</Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={saving}>Abbrechen</Button>
              <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Speichern
              </Button>
            </>
          )}
        </div>
      )}
      <div className={`grid grid-cols-2 md:grid-cols-3 ${preferences.compactTables ? 'gap-1' : 'gap-2'}`}>
        {entries.map(([k, v]) => (
          <div key={k} className={`rounded border border-border bg-secondary/30 ${preferences.compactTables ? 'p-1' : 'p-2'}`}>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</div>
            {editing ? (
              <Input
                value={form[k] ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className="h-7 text-xs font-mono mt-1"
              />
            ) : (
              <div className={`font-mono truncate ${preferences.compactTables ? 'text-[10px]' : 'text-xs'}`} title={String(v ?? '')}>
                {v === null || v === '' ? '—' : String(v)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


function SimpleTable({ rows, cols }: { rows: any[]; cols: { k: string; l: string }[] }) {
  const { preferences } = usePreferences();
  if (!rows.length) return <div className={`${preferences.compactTables ? 'text-[10px]' : 'text-xs'} text-muted-foreground`}>Keine Einträge</div>;
  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table className={preferences.compactTables ? 'table-compact' : ''}>
        <TableHeader>
          <TableRow>{cols.map((c) => <TableHead key={c.k} className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>{c.l}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {cols.map((c) => <TableCell key={c.k} className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'}>{r[c.k] ?? '—'}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------- Import tab ----------------
function ImportTab() {
  const { preferences } = usePreferences();
  const { user } = useAuth();
  const [pending, setPending] = useState<Pending[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ file: string; ok: boolean; msg: string }[]>([]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const newPending: Pending[] = [];
    for (const f of Array.from(files)) {
      const type = detectImportType(f.name);
      if (!type) { toast.error(`Typ nicht erkannt: ${f.name}`); continue; }
      try {
        const { headers, rows } = await readXlsx(f);
        newPending.push({ file: f, type, rows, headers });
      } catch (e: any) {
        toast.error(`Fehler beim Lesen: ${f.name} – ${e.message}`);
      }
    }
    setPending((p) => [...p, ...newPending]);
  };

  const runAll = async () => {
    if (!user) return;
    setRunning(true);
    setResults([]);
    const order: ImportType[] = ['articles', 'status90', 'attributes', 'prices', 'price_list_items', 'customer_refs', 'supplier_refs', 'bom'];
    const sorted = [...pending].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    const out: { file: string; ok: boolean; msg: string }[] = [];
    for (const p of sorted) {
      try {
        const r = await runImport(p.type, p.rows, user.id, p.file.name);
        try {
          const path = `${new Date().toISOString().slice(0, 10)}/${p.type}/${Date.now()}_${p.file.name}`;
          await supabase.storage.from('article-imports').upload(path, p.file, { upsert: false });
        } catch {}
        out.push({
          file: p.file.name, ok: r.rowsFailed === 0,
          msg: `${r.rowsUpserted}/${r.rowsProcessed} übernommen${r.rowsFailed ? `, ${r.rowsFailed} Fehler` : ''} (${r.durationMs}ms)`,
        });
      } catch (e: any) {
        out.push({ file: p.file.name, ok: false, msg: e.message });
      }
      setResults([...out]);
    }
    setRunning(false);
    setPending([]);
    toast.success('Import abgeschlossen');
  };

  const remove = (i: number) => setPending((p) => p.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4 pt-4">
      <div className="rounded-md border border-border bg-card p-4">
        <label className="block cursor-pointer rounded-md border-2 border-dashed border-border bg-secondary/30 p-6 text-center hover:bg-secondary/50 transition-colors">
          <input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <div className="text-xs font-medium">XLSX-Dateien wählen oder hierher ziehen</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Typ wird automatisch am Dateinamen erkannt (Artikelstamm, Sachmerkmale, Artikelpreis, Artikelpreisliste, Kundenartikel, Lieferantenartikel, Stueckliste, Status90)
          </div>
        </label>
      </div>
      {pending.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-xs font-medium">{pending.length} Datei(en) bereit</div>
            <Button size="sm" onClick={runAll} disabled={running}>
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Import starten
            </Button>
          </div>
          <Table className={preferences.compactTables ? 'table-compact' : ''}>
            <TableHeader>
              <TableRow>
                <TableHead className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>Datei</TableHead>
                <TableHead className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>Typ</TableHead>
                <TableHead className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} text-right`}>Zeilen</TableHead>
                <TableHead className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>Vorschau</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'}><FileSpreadsheet className="h-3 w-3 inline mr-1" />{p.file.name}</TableCell>
                  <TableCell className={preferences.compactTables ? 'px-2 py-1' : 'px-4 py-2'}><Badge variant="secondary" className="text-[10px]">{IMPORT_TYPE_LABEL[p.type]}</Badge></TableCell>
                  <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} text-right`}>{p.rows.length}</TableCell>
                  <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} text-muted-foreground max-w-md truncate`}>
                    {p.headers.slice(0, 6).join(' · ')}…
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className={preferences.compactTables ? 'h-6 text-[10px]' : 'h-7 text-xs'} onClick={() => remove(i)} disabled={running}>Entfernen</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {results.length > 0 && (
        <div className="rounded-md border border-border bg-card p-3 space-y-1.5">
          <div className="text-xs font-medium mb-2">Ergebnis</div>
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              <span className="font-mono">{r.file}</span>
              <span className="text-muted-foreground">— {r.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- History tab ----------------
function HistoryTab() {
  const { preferences } = usePreferences();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from('article_import_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setRows(data ?? []);
    })();
  }, []);
  return (
    <div className="pt-4 rounded-md border border-border bg-card">
      <Table className={preferences.compactTables ? 'table-compact' : ''}>
        <TableHeader>
          <TableRow>
            <TableHead className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>Zeitpunkt</TableHead>
            <TableHead className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>Datei</TableHead>
            <TableHead className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'}>Typ</TableHead>
            <TableHead className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} text-right`}>Zeilen</TableHead>
            <TableHead className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} text-right`}>Upsert</TableHead>
            <TableHead className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} text-right`}>Fehler</TableHead>
            <TableHead className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-[10px] px-4 py-2'} text-right`}>Dauer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={7} className={`${preferences.compactTables ? 'text-[10px] py-3' : 'text-xs py-6'} text-center text-muted-foreground`}>Noch keine Importe</TableCell></TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className={preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'}>{new Date(r.created_at).toLocaleString('de-DE')}</TableCell>
              <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} font-mono truncate max-w-[260px]`}>{r.file_name}</TableCell>
              <TableCell className={preferences.compactTables ? 'px-2 py-1' : 'px-4 py-2'}><Badge variant="secondary" className="text-[10px]">{IMPORT_TYPE_LABEL[r.import_type as ImportType] ?? r.import_type}</Badge></TableCell>
              <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} text-right`}>{r.rows_processed}</TableCell>
              <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} text-right`}>{r.rows_inserted}</TableCell>
              <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} text-right`}>{r.rows_failed > 0 ? <span className="text-destructive">{r.rows_failed}</span> : 0}</TableCell>
              <TableCell className={`${preferences.compactTables ? 'text-[10px] px-2 py-1' : 'text-xs px-4 py-2'} text-right text-muted-foreground`}>{r.duration_ms}ms</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
