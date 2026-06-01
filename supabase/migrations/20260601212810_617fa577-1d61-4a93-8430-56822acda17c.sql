
CREATE TABLE public.map_custom_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'system',
  color text,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_custom_nodes TO authenticated;
GRANT ALL ON public.map_custom_nodes TO service_role;
ALTER TABLE public.map_custom_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_custom_nodes read all auth"
  ON public.map_custom_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_custom_nodes write staff"
  ON public.map_custom_nodes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
CREATE TRIGGER update_map_custom_nodes_updated_at
  BEFORE UPDATE ON public.map_custom_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.map_custom_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  to_type text NOT NULL,
  to_id uuid NOT NULL,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_custom_edges TO authenticated;
GRANT ALL ON public.map_custom_edges TO service_role;
ALTER TABLE public.map_custom_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_custom_edges read all auth"
  ON public.map_custom_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_custom_edges write staff"
  ON public.map_custom_edges FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE TABLE public.map_node_positions (
  node_type text NOT NULL,
  node_id uuid NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (node_type, node_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_node_positions TO authenticated;
GRANT ALL ON public.map_node_positions TO service_role;
ALTER TABLE public.map_node_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_node_positions read all auth"
  ON public.map_node_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_node_positions write staff"
  ON public.map_node_positions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
