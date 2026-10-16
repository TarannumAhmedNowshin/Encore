export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          anonymise_customer: boolean
          created_at: string
          customer_name: string | null
          department: string | null
          document_type: string | null
          existing_solution: string | null
          id: string
          is_showcase: boolean
          status: string
          target_region: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anonymise_customer?: boolean
          created_at?: string
          customer_name?: string | null
          department?: string | null
          document_type?: string | null
          existing_solution?: string | null
          id?: string
          is_showcase?: boolean
          status?: string
          target_region?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anonymise_customer?: boolean
          created_at?: string
          customer_name?: string | null
          department?: string | null
          document_type?: string | null
          existing_solution?: string | null
          id?: string
          is_showcase?: boolean
          status?: string
          target_region?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      citations: {
        Row: {
          created_at: string
          fact_id: string
          id: string
          quote: string | null
          source_title: string | null
          source_url: string | null
          updated_at: string
          user_id: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string
          fact_id: string
          id?: string
          quote?: string | null
          source_title?: string | null
          source_url?: string | null
          updated_at?: string
          user_id: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string
          fact_id?: string
          id?: string
          quote?: string | null
          source_title?: string | null
          source_url?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "citations_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "facts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_scores: {
        Row: {
          contact_id: string
          created_at: string
          evidence_strength: string | null
          id: string
          rationale: string | null
          role_fit: string | null
          seniority_fit: string | null
          similarity_to_original: string | null
          total_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          evidence_strength?: string | null
          id?: string
          rationale?: string | null
          role_fit?: string | null
          seniority_fit?: string | null
          similarity_to_original?: string | null
          total_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          evidence_strength?: string | null
          id?: string
          rationale?: string | null
          role_fit?: string | null
          seniority_fit?: string | null
          similarity_to_original?: string | null
          total_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_scores_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          analysis_id: string
          buying_role_slot: string | null
          created_at: string
          department_id: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          name: string | null
          persona_id: string | null
          rationale: string | null
          target_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          buying_role_slot?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name?: string | null
          persona_id?: string | null
          rationale?: string | null
          target_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          buying_role_slot?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name?: string | null
          persona_id?: string | null
          rationale?: string | null
          target_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          name: string | null
          quote: string | null
          rank: string | null
          rationale: string | null
          source_url: string | null
          target_id: string
          updated_at: string
          user_id: string
          verified: boolean | null
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          name?: string | null
          quote?: string | null
          rank?: string | null
          rationale?: string | null
          source_url?: string | null
          target_id: string
          updated_at?: string
          user_id: string
          verified?: boolean | null
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          name?: string | null
          quote?: string | null
          rank?: string | null
          rationale?: string | null
          source_url?: string | null
          target_id?: string
          updated_at?: string
          user_id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          analysis_id: string
          created_at: string
          file_path: string | null
          filename: string | null
          id: string
          mime: string | null
          page_count: number | null
          pages: Json | null
          sha256: string | null
          size_bytes: number | null
          text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          file_path?: string | null
          filename?: string | null
          id?: string
          mime?: string | null
          page_count?: number | null
          pages?: Json | null
          sha256?: string | null
          size_bytes?: number | null
          text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          file_path?: string | null
          filename?: string | null
          id?: string
          mime?: string | null
          page_count?: number | null
          pages?: Json | null
          sha256?: string | null
          size_bytes?: number | null
          text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      facts: {
        Row: {
          agent: string | null
          analysis_id: string
          attribute: string | null
          confidence: string | null
          created_at: string
          derived_from: string[]
          id: string
          label: string | null
          origin: string | null
          stakeholder_id: string | null
          status: string
          subject: string | null
          target_id: string | null
          updated_at: string
          user_id: string
          value: string | null
        }
        Insert: {
          agent?: string | null
          analysis_id: string
          attribute?: string | null
          confidence?: string | null
          created_at?: string
          derived_from?: string[]
          id?: string
          label?: string | null
          origin?: string | null
          stakeholder_id?: string | null
          status?: string
          subject?: string | null
          target_id?: string | null
          updated_at?: string
          user_id: string
          value?: string | null
        }
        Update: {
          agent?: string | null
          analysis_id?: string
          attribute?: string | null
          confidence?: string | null
          created_at?: string
          derived_from?: string[]
          id?: string
          label?: string | null
          origin?: string | null
          stakeholder_id?: string | null
          status?: string
          subject?: string | null
          target_id?: string | null
          updated_at?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "stakeholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          query: string | null
          target_id: string | null
          text: string | null
          title: string | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          query?: string | null
          target_id?: string | null
          text?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          query?: string | null
          target_id?: string | null
          text?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "targets"
            referencedColumns: ["id"]
          },
        ]
      }
      need_signals: {
        Row: {
          analysis_id: string
          created_at: string
          id: string
          observable_at: string | null
          search_query: string | null
          signal: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          id?: string
          observable_at?: string | null
          search_query?: string | null
          signal?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          id?: string
          observable_at?: string | null
          search_query?: string | null
          signal?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "need_signals_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_drafts: {
        Row: {
          all_claims_verified: boolean | null
          analysis_id: string
          body: string | null
          channel: string | null
          claims: Json | null
          contact_id: string
          created_at: string
          decided_at: string | null
          edited_body: string | null
          id: string
          rejection_reason: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          all_claims_verified?: boolean | null
          analysis_id: string
          body?: string | null
          channel?: string | null
          claims?: Json | null
          contact_id: string
          created_at?: string
          decided_at?: string | null
          edited_body?: string | null
          id?: string
          rejection_reason?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          all_claims_verified?: boolean | null
          analysis_id?: string
          body?: string | null
          channel?: string | null
          claims?: Json | null
          contact_id?: string
          created_at?: string
          decided_at?: string | null
          edited_body?: string | null
          id?: string
          rejection_reason?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_drafts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          analysis_id: string
          buying_roles: string[] | null
          created_at: string
          function: string | null
          id: string
          label: string | null
          problem_ownership: string | null
          rationale: string | null
          responsibilities: string | null
          seniority: string | null
          source_stakeholder_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          buying_roles?: string[] | null
          created_at?: string
          function?: string | null
          id?: string
          label?: string | null
          problem_ownership?: string | null
          rationale?: string | null
          responsibilities?: string | null
          seniority?: string | null
          source_stakeholder_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          buying_roles?: string[] | null
          created_at?: string
          function?: string | null
          id?: string
          label?: string | null
          problem_ownership?: string | null
          rationale?: string | null
          responsibilities?: string | null
          seniority?: string | null
          source_stakeholder_ids?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          analysis_id: string
          created_at: string
          done: number
          error: string | null
          id: string
          message: string | null
          status: string | null
          step: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          done?: number
          error?: string | null
          id?: string
          message?: string | null
          status?: string | null
          step?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          done?: number
          error?: string | null
          id?: string
          message?: string | null
          status?: string | null
          step?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_dna: {
        Row: {
          analysis_id: string
          created_at: string
          current_process_summary: string | null
          id: string
          industry_characteristics: string | null
          measurable_outcomes_summary: string | null
          operational_characteristics: string | null
          organizational_characteristics: string | null
          owning_department: string | null
          primary_buyers_summary: string | null
          problem_summary: string | null
          regulatory_characteristics: string | null
          search_plan: Json | null
          solution_capabilities_summary: string | null
          technology_characteristics: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          analysis_id: string
          created_at?: string
          current_process_summary?: string | null
          id?: string
          industry_characteristics?: string | null
          measurable_outcomes_summary?: string | null
          operational_characteristics?: string | null
          organizational_characteristics?: string | null
          owning_department?: string | null
          primary_buyers_summary?: string | null
          problem_summary?: string | null
          regulatory_characteristics?: string | null
          search_plan?: Json | null
          solution_capabilities_summary?: string | null
          technology_characteristics?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          analysis_id?: string
          created_at?: string
          current_process_summary?: string | null
          id?: string
          industry_characteristics?: string | null
          measurable_outcomes_summary?: string | null
          operational_characteristics?: string | null
          organizational_characteristics?: string | null
          owning_department?: string | null
          primary_buyers_summary?: string | null
          problem_summary?: string | null
          regulatory_characteristics?: string | null
          search_plan?: Json | null
          solution_capabilities_summary?: string | null
          technology_characteristics?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_dna_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholders: {
        Row: {
          analysis_id: string
          confidence: string | null
          created_at: string
          department: string | null
          id: string
          is_placeholder: boolean
          label: string | null
          name: string | null
          project_role: string | null
          quote: string | null
          quote_verified: boolean | null
          title: string | null
          updated_at: string
          user_id: string
          user_provided: boolean | null
        }
        Insert: {
          analysis_id: string
          confidence?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_placeholder?: boolean
          label?: string | null
          name?: string | null
          project_role?: string | null
          quote?: string | null
          quote_verified?: boolean | null
          title?: string | null
          updated_at?: string
          user_id: string
          user_provided?: boolean | null
        }
        Update: {
          analysis_id?: string
          confidence?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_placeholder?: boolean
          label?: string | null
          name?: string | null
          project_role?: string | null
          quote?: string | null
          quote_verified?: boolean | null
          title?: string | null
          updated_at?: string
          user_id?: string
          user_provided?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "stakeholders_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      targets: {
        Row: {
          analysis_id: string
          buyer_fit: string | null
          created_at: string
          dimensions: Json | null
          error: string | null
          evidence: Json
          evidence_score: number | null
          evidence_strength: string | null
          hq_country: string | null
          id: string
          in_target_region: boolean | null
          linkedin_url: string | null
          name: string | null
          on_watch_list: boolean
          opportunity_score: number | null
          problem_fit: string | null
          rejection_reason: string | null
          similarity_percent: number | null
          source_urls: string[] | null
          status: string
          updated_at: string
          user_id: string
          website: string | null
          why_considered: string | null
        }
        Insert: {
          analysis_id: string
          buyer_fit?: string | null
          created_at?: string
          dimensions?: Json | null
          error?: string | null
          evidence?: Json
          evidence_score?: number | null
          evidence_strength?: string | null
          hq_country?: string | null
          id?: string
          in_target_region?: boolean | null
          linkedin_url?: string | null
          name?: string | null
          on_watch_list?: boolean
          opportunity_score?: number | null
          problem_fit?: string | null
          rejection_reason?: string | null
          similarity_percent?: number | null
          source_urls?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
          why_considered?: string | null
        }
        Update: {
          analysis_id?: string
          buyer_fit?: string | null
          created_at?: string
          dimensions?: Json | null
          error?: string | null
          evidence?: Json
          evidence_score?: number | null
          evidence_strength?: string | null
          hq_country?: string | null
          id?: string
          in_target_region?: boolean | null
          linkedin_url?: string | null
          name?: string | null
          on_watch_list?: boolean
          opportunity_score?: number | null
          problem_fit?: string | null
          rejection_reason?: string | null
          similarity_percent?: number | null
          source_urls?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
          why_considered?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "targets_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_showcase_analysis: { Args: { _id: string }; Returns: boolean }
      is_showcase_fact: { Args: { _id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
