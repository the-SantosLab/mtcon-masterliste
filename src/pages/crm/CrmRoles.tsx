import { CrmLayout } from '@/components/CrmLayout';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLES = [
  { key: 'crm_admin', label: 'CRM Admin', desc: 'Voller Zugriff' },
  { key: 'crm_vertrieb', label: 'CRM Vertrieb', desc: 'Eigene Deals + alle Companies/Contacts' },
  { key: 'crm_sdr', label: 'CRM SDR', desc: 'Outbound + Leads, keine Finanzdaten' },
  { key: 'crm_readonly', label: 'CRM Readonly', desc: 'Nur lesen' },
];

const FEATURES = [
  { key: 'view_deals', label: 'Deals sehen', perms: { crm_admin: true, crm_vertrieb: true, crm_sdr: false, crm_readonly: true } },
  { key: 'edit_deals', label: 'Deals bearbeiten', perms: { crm_admin: true, crm_vertrieb: true, crm_sdr: false, crm_readonly: false } },
  { key: 'view_finance', label: 'Finanz-Werte sehen (Angebote, Forecast)', perms: { crm_admin: true, crm_vertrieb: true, crm_sdr: false, crm_readonly: true } },
  { key: 'view_companies', label: 'Companies/Contacts sehen', perms: { crm_admin: true, crm_vertrieb: true, crm_sdr: true, crm_readonly: true } },
  { key: 'edit_companies', label: 'Companies/Contacts bearbeiten', perms: { crm_admin: true, crm_vertrieb: true, crm_sdr: true, crm_readonly: false } },
  { key: 'manage_outbound', label: 'Outbound Sequenzen verwalten', perms: { crm_admin: true, crm_vertrieb: false, crm_sdr: true, crm_readonly: false } },
  { key: 'manage_leads', label: 'Leads verwalten', perms: { crm_admin: true, crm_vertrieb: false, crm_sdr: true, crm_readonly: false } },
  { key: 'edit_wiki', label: 'Wiki bearbeiten', perms: { crm_admin: true, crm_vertrieb: false, crm_sdr: false, crm_readonly: false } },
  { key: 'assign_roles', label: 'Rollen vergeben', perms: { crm_admin: true, crm_vertrieb: false, crm_sdr: false, crm_readonly: false } },
  { key: 'activate_sequences', label: 'Sequenzen aktivieren', perms: { crm_admin: true, crm_vertrieb: false, crm_sdr: false, crm_readonly: false } },
];

export default function CrmRoles() {
  return (
    <CrmLayout>
      <h1 className="text-xl font-semibold text-foreground mb-1">Rollen & Berechtigungen</h1>
      <p className="text-xs text-muted-foreground mb-4">Übersicht der CRM-spezifischen Rollen-Matrix. Aktuell sind die Rollen frontendbasiert; Rollen-Zuweisung erfolgt über die Benutzerverwaltung.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {ROLES.map(r => (
          <div key={r.key} className="p-3 rounded border border-border bg-card/40">
            <p className="text-sm font-semibold text-foreground">{r.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
            <tr>
              <th className="text-left p-2">Berechtigung</th>
              {ROLES.map(r => <th key={r.key} className="text-center p-2">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map(f => (
              <tr key={f.key} className="border-t border-border/40">
                <td className="p-2 text-foreground">{f.label}</td>
                {ROLES.map(r => {
                  const allowed = (f.perms as any)[r.key];
                  return (
                    <td key={r.key} className="p-2 text-center">
                      {allowed
                        ? <Check className={cn('h-3.5 w-3.5 inline text-emerald-400')} />
                        : <X className={cn('h-3.5 w-3.5 inline text-muted-foreground/50')} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CrmLayout>
  );
}
