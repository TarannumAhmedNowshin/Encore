CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  title text, customer_name text, department text, existing_solution text,
  document_type text CHECK (document_type IN ('sow','proposal','project_doc','architecture','other')),
  target_region text NOT NULL DEFAULT 'us' CHECK (target_region IN ('us','uk_ie','eu','global')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','extracting','needs_review','ready')),
  anonymise_customer boolean NOT NULL DEFAULT true, is_showcase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  file_path text, filename text, mime text, size_bytes int, sha256 text, text text, pages jsonb, page_count int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sha256));

CREATE TABLE public.stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  name text, title text, department text, project_role text, user_provided boolean,
  is_placeholder boolean NOT NULL DEFAULT false,
  label text CHECK (label IN ('explicitly_stated','inferred','missing','potentially_outdated','user')),
  confidence text CHECK (confidence IN ('high','medium','low')),
  quote text, quote_verified boolean,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  label text, function text, seniority text, responsibilities text, problem_ownership text, rationale text,
  buying_roles text[], source_stakeholder_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.sales_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL UNIQUE REFERENCES public.analyses(id) ON DELETE CASCADE,
  problem_summary text, current_process_summary text, solution_capabilities_summary text,
  measurable_outcomes_summary text, primary_buyers_summary text, industry_characteristics text,
  regulatory_characteristics text, operational_characteristics text, organizational_characteristics text,
  technology_characteristics text, owning_department text, search_plan jsonb, version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.need_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  signal text, observable_at text, search_query text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  name text, website text, linkedin_url text, hq_country text, in_target_region boolean, why_considered text,
  source_urls text[],
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','researching','qualified','rejected','failed')),
  rejection_reason text, dimensions jsonb, evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  similarity_percent int, evidence_score int, evidence_strength text, problem_fit text, buyer_fit text,
  opportunity_score int, on_watch_list boolean NOT NULL DEFAULT false, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  subject text CHECK (subject IN ('company','business_problem','solution','stakeholder','business_context','target_evidence')),
  attribute text, value text,
  origin text CHECK (origin IN ('document','external','inference','user')),
  label text CHECK (label IN ('explicitly_stated','inferred','missing','potentially_outdated','user')),
  confidence text CHECK (confidence IN ('high','medium','low')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','rejected')),
  agent text,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE,
  stakeholder_id uuid REFERENCES public.stakeholders(id) ON DELETE SET NULL,
  derived_from uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  fact_id uuid NOT NULL REFERENCES public.facts(id) ON DELETE CASCADE,
  source_title text, source_url text, quote text, verified boolean,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  target_id uuid REFERENCES public.targets(id) ON DELETE CASCADE,
  query text, url text, title text, text text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  target_id uuid NOT NULL REFERENCES public.targets(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  name text, rank text CHECK (rank IN ('primary','secondary')),
  rationale text, source_url text, quote text, verified boolean,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  target_id uuid NOT NULL REFERENCES public.targets(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  name text, title text, linkedin_url text, location text,
  persona_id uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  buying_role_slot text CHECK (buying_role_slot IN ('executive_buyer','business_sponsor','operational_buyer','technical_influencer','end_user')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.contact_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  contact_id uuid NOT NULL UNIQUE REFERENCES public.contacts(id) ON DELETE CASCADE,
  role_fit text CHECK (role_fit IN ('high','medium','low')),
  seniority_fit text CHECK (seniority_fit IN ('high','medium','low')),
  similarity_to_original text CHECK (similarity_to_original IN ('high','medium','low')),
  evidence_strength text CHECK (evidence_strength IN ('high','medium','low')),
  rationale text, total_score int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.outreach_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  channel text CHECK (channel IN ('email','executive_intro','linkedin_message','talking_points')),
  subject text, body text, claims jsonb, all_claims_verified boolean,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','edited','rejected')),
  edited_body text, rejection_reason text, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  step text, status text CHECK (status IN ('running','done','failed','paused')),
  done int NOT NULL DEFAULT 0, total int NOT NULL DEFAULT 0, message text, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('discovery','people_search','ai_call','search','scrape')),
  units int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses, public.documents, public.stakeholders, public.personas,
  public.sales_dna, public.need_signals, public.targets, public.facts, public.citations, public.materials,
  public.departments, public.contacts, public.contact_scores, public.outreach_drafts, public.runs TO authenticated;
GRANT SELECT ON public.usage_events TO authenticated;
GRANT ALL ON public.analyses, public.documents, public.stakeholders, public.personas, public.sales_dna,
  public.need_signals, public.targets, public.facts, public.citations, public.materials, public.departments,
  public.contacts, public.contact_scores, public.outreach_drafts, public.runs, public.usage_events TO service_role;

-- RLS
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.need_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Showcase helpers
CREATE OR REPLACE FUNCTION public.is_showcase_analysis(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.analyses WHERE id = _id AND is_showcase = true) $$;
CREATE OR REPLACE FUNCTION public.is_showcase_fact(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.facts f JOIN public.analyses a ON a.id = f.analysis_id WHERE f.id = _id AND a.is_showcase = true) $$;
REVOKE EXECUTE ON FUNCTION public.is_showcase_analysis(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_showcase_fact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_showcase_analysis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_showcase_fact(uuid) TO authenticated;

-- Owner policies (one ALL policy per table covers select/insert/update/delete)
CREATE POLICY "owner all" ON public.analyses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.documents FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.stakeholders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.personas FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.sales_dna FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.need_signals FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.targets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.facts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.citations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.materials FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.departments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.contacts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.contact_scores FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.outreach_drafts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner all" ON public.runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner read" ON public.usage_events FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Showcase read policies (not on contacts, contact_scores, outreach_drafts)
CREATE POLICY "showcase read" ON public.analyses FOR SELECT TO authenticated USING (is_showcase = true);
CREATE POLICY "showcase read" ON public.documents FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.stakeholders FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.facts FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.citations FOR SELECT TO authenticated USING (public.is_showcase_fact(fact_id));
CREATE POLICY "showcase read" ON public.personas FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.sales_dna FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.need_signals FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.targets FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.materials FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));
CREATE POLICY "showcase read" ON public.departments FOR SELECT TO authenticated USING (public.is_showcase_analysis(analysis_id));

-- updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stakeholders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sales_dna FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.need_signals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.facts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.citations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contact_scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.outreach_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.usage_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes on user_id and foreign keys
CREATE INDEX ON public.analyses(user_id);
CREATE INDEX ON public.documents(user_id); CREATE INDEX ON public.documents(analysis_id);
CREATE INDEX ON public.stakeholders(user_id); CREATE INDEX ON public.stakeholders(analysis_id);
CREATE INDEX ON public.personas(user_id); CREATE INDEX ON public.personas(analysis_id);
CREATE INDEX ON public.sales_dna(user_id);
CREATE INDEX ON public.need_signals(user_id); CREATE INDEX ON public.need_signals(analysis_id);
CREATE INDEX ON public.targets(user_id); CREATE INDEX ON public.targets(analysis_id);
CREATE INDEX ON public.facts(user_id); CREATE INDEX ON public.facts(analysis_id); CREATE INDEX ON public.facts(target_id); CREATE INDEX ON public.facts(stakeholder_id);
CREATE INDEX ON public.citations(user_id); CREATE INDEX ON public.citations(fact_id);
CREATE INDEX ON public.materials(user_id); CREATE INDEX ON public.materials(analysis_id); CREATE INDEX ON public.materials(target_id);
CREATE INDEX ON public.departments(user_id); CREATE INDEX ON public.departments(target_id); CREATE INDEX ON public.departments(analysis_id);
CREATE INDEX ON public.contacts(user_id); CREATE INDEX ON public.contacts(target_id); CREATE INDEX ON public.contacts(analysis_id); CREATE INDEX ON public.contacts(persona_id); CREATE INDEX ON public.contacts(department_id);
CREATE INDEX ON public.contact_scores(user_id);
CREATE INDEX ON public.outreach_drafts(user_id); CREATE INDEX ON public.outreach_drafts(contact_id); CREATE INDEX ON public.outreach_drafts(analysis_id);
CREATE INDEX ON public.runs(user_id); CREATE INDEX ON public.runs(analysis_id);
CREATE INDEX ON public.usage_events(user_id);

-- Storage: private documents bucket, own folder only
CREATE POLICY "documents own read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents own insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents own update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "documents own delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.targets;