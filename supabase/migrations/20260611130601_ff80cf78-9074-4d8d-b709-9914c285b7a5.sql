-- 1) Mapping Personio-Mitarbeiter → unser Profil
CREATE TABLE IF NOT EXISTS public.personio_employee_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users_profile(id) ON DELETE CASCADE,
  personio_employee_id text NOT NULL UNIQUE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.personio_employee_map TO authenticated;
GRANT ALL ON public.personio_employee_map TO service_role;
ALTER TABLE public.personio_employee_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read employee map" ON public.personio_employee_map
  FOR SELECT TO authenticated USING (true);

-- 2) Anwesenheiten (Kommen/Gehen pro Tag)
CREATE TABLE IF NOT EXISTS public.personio_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  personio_attendance_id text UNIQUE,
  work_date date NOT NULL,
  start_time time,
  end_time time,
  break_minutes integer NOT NULL DEFAULT 0,
  worked_minutes integer NOT NULL DEFAULT 0,
  comment text,
  source text NOT NULL DEFAULT 'personio', -- 'personio' | 'manual'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personio_att_user_date ON public.personio_attendances(user_id, work_date DESC);
GRANT SELECT ON public.personio_attendances TO authenticated;
GRANT ALL ON public.personio_attendances TO service_role;
ALTER TABLE public.personio_attendances ENABLE ROW LEVEL SECURITY;

-- 3) Abwesenheiten (Urlaub, Krank etc.)
CREATE TABLE IF NOT EXISTS public.personio_absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  personio_absence_id text UNIQUE,
  absence_type text NOT NULL,         -- z. B. 'Urlaub', 'Krank', 'Sonderurlaub'
  category text,                       -- 'vacation' | 'sick' | 'other'
  start_date date NOT NULL,
  end_date date NOT NULL,
  half_day_start boolean NOT NULL DEFAULT false,
  half_day_end boolean NOT NULL DEFAULT false,
  days_count numeric(5,2) NOT NULL DEFAULT 0,
  status text,                         -- 'approved' | 'pending' | 'rejected'
  comment text,
  source text NOT NULL DEFAULT 'personio',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personio_abs_user_range ON public.personio_absences(user_id, start_date, end_date);
GRANT SELECT ON public.personio_absences TO authenticated;
GRANT ALL ON public.personio_absences TO service_role;
ALTER TABLE public.personio_absences ENABLE ROW LEVEL SECURITY;

-- 4) Manuelle Ergänzungen (audit)
CREATE TABLE IF NOT EXISTS public.personio_manual_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  entry_kind text NOT NULL, -- 'attendance' | 'absence'
  ref_id uuid,              -- FK auf attendances/absences je nach kind
  created_by uuid REFERENCES public.users_profile(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.personio_manual_entries TO authenticated;
GRANT ALL ON public.personio_manual_entries TO service_role;
ALTER TABLE public.personio_manual_entries ENABLE ROW LEVEL SECURITY;

-- Sichtbarkeitsfunktion: kann uid die Zeitdaten von target sehen?
CREATE OR REPLACE FUNCTION public.can_view_attendance(p_target_user uuid, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_uid IS NOT NULL
    AND (
      p_uid = p_target_user
      OR public.check_is_admin(p_uid)
      OR public.is_direct_report(p_uid, p_target_user)
      OR EXISTS (
        SELECT 1
        FROM public.users_profile up
        WHERE up.id = p_target_user
          AND up.department_id IS NOT NULL
          AND public.is_dept_lead(up.department_id, p_uid)
      )
    );
$$;

-- RLS Policies (read)
CREATE POLICY "view own/team attendance" ON public.personio_attendances
  FOR SELECT TO authenticated
  USING (public.can_view_attendance(user_id));

CREATE POLICY "view own/team absences" ON public.personio_absences
  FOR SELECT TO authenticated
  USING (public.can_view_attendance(user_id));

CREATE POLICY "view manual entries" ON public.personio_manual_entries
  FOR SELECT TO authenticated
  USING (public.can_view_attendance(user_id));

-- Admin / Lead darf manuell ergänzen
CREATE POLICY "admins/leads insert attendance" ON public.personio_attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual' AND public.can_view_attendance(user_id)
    AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid()))
  );

CREATE POLICY "admins/leads update attendance" ON public.personio_attendances
  FOR UPDATE TO authenticated
  USING (source = 'manual' AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid())))
  WITH CHECK (source = 'manual' AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid())));

CREATE POLICY "admins/leads delete attendance" ON public.personio_attendances
  FOR DELETE TO authenticated
  USING (source = 'manual' AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid())));

CREATE POLICY "admins/leads insert absence" ON public.personio_absences
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual' AND public.can_view_attendance(user_id)
    AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid()))
  );

CREATE POLICY "admins/leads update absence" ON public.personio_absences
  FOR UPDATE TO authenticated
  USING (source = 'manual' AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid())))
  WITH CHECK (source = 'manual' AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid())));

CREATE POLICY "admins/leads delete absence" ON public.personio_absences
  FOR DELETE TO authenticated
  USING (source = 'manual' AND (public.check_is_admin(auth.uid()) OR public.is_any_dept_lead(auth.uid())));

CREATE POLICY "log manual entry" ON public.personio_manual_entries
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- updated_at trigger
CREATE TRIGGER trg_personio_att_updated BEFORE UPDATE ON public.personio_attendances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_personio_abs_updated BEFORE UPDATE ON public.personio_absences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_personio_map_updated BEFORE UPDATE ON public.personio_employee_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime aktivieren
ALTER TABLE public.personio_attendances REPLICA IDENTITY FULL;
ALTER TABLE public.personio_absences REPLICA IDENTITY FULL;
ALTER TABLE public.personio_employee_map REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.personio_attendances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.personio_absences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.personio_employee_map;