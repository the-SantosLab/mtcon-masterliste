
-- Fix: make code nullable for child departments
ALTER TABLE departments ALTER COLUMN code DROP NOT NULL;

-- 1. Add hierarchical columns
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES departments(id);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  department_id uuid NOT NULL REFERENCES departments(id),
  created_by uuid REFERENCES users_profile(id),
  assigned_to uuid REFERENCES users_profile(id),
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read tickets" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert tickets" ON tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update tickets" ON tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admin delete tickets" ON tickets FOR DELETE TO authenticated USING (is_admin());

-- 3. Create ticket_events table
CREATE TABLE IF NOT EXISTS ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_department_id uuid REFERENCES departments(id),
  to_department_id uuid REFERENCES departments(id),
  from_status text,
  to_status text,
  actor_id uuid REFERENCES users_profile(id),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read ticket_events" ON ticket_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert ticket_events" ON ticket_events FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Counter
INSERT INTO counters (key, value) VALUES ('ticket_mtcon', 0) ON CONFLICT (key) DO NOTHING;

-- 5. updated_at trigger
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Auto audit: created
CREATE OR REPLACE FUNCTION ticket_created_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO ticket_events (ticket_id, event_type, to_department_id, actor_id)
  VALUES (NEW.id, 'created', NEW.department_id, NEW.created_by);
  RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_after_insert AFTER INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION ticket_created_event();

-- 7. Auto audit: updated
CREATE OR REPLACE FUNCTION ticket_updated_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
    INSERT INTO ticket_events (ticket_id, event_type, from_department_id, to_department_id, actor_id)
    VALUES (NEW.id, 'moved', OLD.department_id, NEW.department_id, auth.uid());
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO ticket_events (ticket_id, event_type, from_status, to_status, actor_id)
    VALUES (NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid());
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO ticket_events (ticket_id, event_type, actor_id, meta)
    VALUES (NEW.id, 'assigned', auth.uid(), jsonb_build_object('from_user', OLD.assigned_to, 'to_user', NEW.assigned_to));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_after_update AFTER UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION ticket_updated_event();

-- 8. RPCs
CREATE OR REPLACE FUNCTION create_ticket_atomic(
  p_title text, p_description text DEFAULT NULL, p_department_id uuid DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL, p_priority text DEFAULT 'medium', p_due_date date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_key text; v_counter integer;
BEGIN
  v_counter := next_counter('ticket_mtcon');
  v_key := 'MTCON-' || lpad(v_counter::text, 6, '0');
  INSERT INTO tickets (ticket_key, title, description, department_id, created_by, assigned_to, priority, due_date)
  VALUES (v_key, p_title, p_description, p_department_id, auth.uid(), p_assigned_to, p_priority, p_due_date)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION move_ticket(p_ticket_id uuid, p_to_department_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE tickets SET department_id = p_to_department_id WHERE id = p_ticket_id; END;
$$;

CREATE OR REPLACE FUNCTION change_ticket_status(p_ticket_id uuid, p_to_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE tickets SET status = p_to_status WHERE id = p_ticket_id; END;
$$;

-- 9. Seed departments
INSERT INTO departments (id, name, code, parent_id, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Technischer Bereich', '01', NULL, 1),
  ('a0000001-0000-0000-0000-000000000002', 'Einkauf / Lager & Logistik', '02', NULL, 2),
  ('a0000001-0000-0000-0000-000000000003', 'Vertrieb / Projektmanagement', '03', NULL, 3),
  ('a0000001-0000-0000-0000-000000000004', 'Verwaltung + Human Resources', '04', NULL, 4),
  ('a0000001-0000-0000-0000-000000000005', 'Digitale Transformation & Prozessinnovation', '0C', NULL, 5)
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, name, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'Konstruktion', 'a0000001-0000-0000-0000-000000000001', 1),
  ('b0000001-0000-0000-0000-000000000002', 'Qualitätsmanagement', 'a0000001-0000-0000-0000-000000000001', 2),
  ('b0000001-0000-0000-0000-000000000003', 'Labor + Tests', 'a0000001-0000-0000-0000-000000000001', 3),
  ('b0000001-0000-0000-0000-000000000004', 'BDM / FAE', 'a0000001-0000-0000-0000-000000000001', 4),
  ('b0000001-0000-0000-0000-000000000005', 'Lieferantenklärung (Technisch)', 'a0000001-0000-0000-0000-000000000001', 5),
  ('b0000001-0000-0000-0000-000000000006', 'Sales Partner Betreuung (Technisch)', 'a0000001-0000-0000-0000-000000000001', 6),
  ('b0000001-0000-0000-0000-000000000007', 'Asia (China Fertigung)', 'a0000001-0000-0000-0000-000000000001', 7),
  ('b0000002-0000-0000-0000-000000000001', 'Einkauf', 'a0000001-0000-0000-0000-000000000002', 1),
  ('b0000002-0000-0000-0000-000000000002', 'Lager & Logistik', 'a0000001-0000-0000-0000-000000000002', 2),
  ('b0000002-0000-0000-0000-000000000003', 'Zoll', 'a0000001-0000-0000-0000-000000000002', 3),
  ('b0000002-0000-0000-0000-000000000004', 'Fuhrpark + Tagesfahrten', 'a0000001-0000-0000-0000-000000000002', 4),
  ('b0000002-0000-0000-0000-000000000005', 'Springer + Aushilfen', 'a0000001-0000-0000-0000-000000000002', 5),
  ('b0000003-0000-0000-0000-000000000001', 'Vertrieb', 'a0000001-0000-0000-0000-000000000003', 1),
  ('b0000003-0000-0000-0000-000000000002', 'Vertrieb International', 'a0000001-0000-0000-0000-000000000003', 2),
  ('b0000003-0000-0000-0000-000000000003', 'Key Account Management', 'a0000001-0000-0000-0000-000000000003', 3),
  ('b0000003-0000-0000-0000-000000000004', 'Sales Partner Betreuung (nicht technisch)', 'a0000001-0000-0000-0000-000000000003', 4),
  ('b0000003-0000-0000-0000-000000000005', 'Projektmanagement', 'a0000001-0000-0000-0000-000000000003', 5),
  ('b0000004-0000-0000-0000-000000000001', 'IT', 'a0000001-0000-0000-0000-000000000004', 1),
  ('b0000004-0000-0000-0000-000000000002', 'Buchhaltung', 'a0000001-0000-0000-0000-000000000004', 2),
  ('b0000004-0000-0000-0000-000000000003', 'Personal / Lohn / Vorbereitung', 'a0000001-0000-0000-0000-000000000004', 3),
  ('b0000004-0000-0000-0000-000000000004', 'Marketing', 'a0000001-0000-0000-0000-000000000004', 4),
  ('b0000004-0000-0000-0000-000000000005', 'Risiko-Management', 'a0000001-0000-0000-0000-000000000004', 5),
  ('b0000004-0000-0000-0000-000000000006', 'Sicherheitsbeauftragter', 'a0000001-0000-0000-0000-000000000004', 6),
  ('b0000004-0000-0000-0000-000000000007', 'Azubis', 'a0000001-0000-0000-0000-000000000004', 7),
  ('b0000004-0000-0000-0000-000000000008', 'Aushilfen', 'a0000001-0000-0000-0000-000000000004', 8),
  ('b0000004-0000-0000-0000-000000000009', 'Reinigung', 'a0000001-0000-0000-0000-000000000004', 9),
  ('b0000005-0000-0000-0000-000000000001', 'Prozessoptimierung', 'a0000001-0000-0000-0000-000000000005', 1),
  ('b0000005-0000-0000-0000-000000000002', 'New Technologies', 'a0000001-0000-0000-0000-000000000005', 2),
  ('b0000005-0000-0000-0000-000000000003', 'KI / Chatbots / iPower', 'a0000001-0000-0000-0000-000000000005', 3)
ON CONFLICT (id) DO NOTHING;
