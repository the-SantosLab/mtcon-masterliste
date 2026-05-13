import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export type CrmPermissionKey =
  | 'view_deals' | 'edit_deals' | 'view_finance'
  | 'view_companies' | 'edit_companies'
  | 'manage_outbound' | 'manage_leads'
  | 'edit_wiki' | 'assign_roles' | 'activate_sequences';

const MATRIX: Record<string, Record<CrmPermissionKey, boolean>> = {
  crm_admin:    { view_deals:true, edit_deals:true, view_finance:true, view_companies:true, edit_companies:true, manage_outbound:true, manage_leads:true, edit_wiki:true, assign_roles:true, activate_sequences:true },
  crm_vertrieb: { view_deals:true, edit_deals:true, view_finance:true, view_companies:true, edit_companies:true, manage_outbound:false, manage_leads:false, edit_wiki:false, assign_roles:false, activate_sequences:false },
  crm_sdr:      { view_deals:false, edit_deals:false, view_finance:false, view_companies:true, edit_companies:true, manage_outbound:true, manage_leads:true, edit_wiki:false, assign_roles:false, activate_sequences:false },
  crm_readonly: { view_deals:true, edit_deals:false, view_finance:true, view_companies:true, edit_companies:false, manage_outbound:false, manage_leads:false, edit_wiki:false, assign_roles:false, activate_sequences:false },
};

export function useCrmPermissions() {
  const { user, role } = useAuth();
  const [crmRoles, setCrmRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    void (async () => {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
      setCrmRoles((data ?? []).map((r: any) => String(r.role)));
      setLoading(false);
    })();
  }, [user?.id]);

  // Admin (system) → all true
  const isAdmin = role === 'admin' || crmRoles.includes('admin') || crmRoles.includes('crm_admin');

  const can = (perm: CrmPermissionKey): boolean => {
    if (isAdmin) return true;
    for (const r of crmRoles) {
      const m = MATRIX[r];
      if (m && m[perm]) return true;
    }
    // fallback: staff users get vertrieb-equivalent permissions
    if (role === 'staff') return MATRIX.crm_vertrieb[perm];
    return false;
  };

  return { can, isAdmin, crmRoles, loading };
}
