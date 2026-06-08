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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_executions: {
        Row: {
          action_type: string | null
          error_message: string | null
          executed_at: string
          id: string
          inbox_document_id: string | null
          payload: Json | null
          result: string
          rule_id: string | null
        }
        Insert: {
          action_type?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          inbox_document_id?: string | null
          payload?: Json | null
          result: string
          rule_id?: string | null
        }
        Update: {
          action_type?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          inbox_document_id?: string | null
          payload?: Json | null
          result?: string
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_executions_inbox_document_id_fkey"
            columns: ["inbox_document_id"]
            isOneToOne: false
            referencedRelation: "inbox_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "action_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      action_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          document_type_id: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          trigger: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          trigger: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_rules_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          read_at: string | null
          role: string
          user_id: string
          vorgang_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          role: string
          user_id: string
          vorgang_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          role?: string
          user_id?: string
          vorgang_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_vorgang_id_fkey"
            columns: ["vorgang_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          content: string
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      announcement_receipts: {
        Row: {
          announcement_id: string
          created_at: string
          delivered_at: string | null
          id: string
          read_at: string | null
          seen_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          seen_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          read_at?: string | null
          seen_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_receipts_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          pinned: boolean
          published_at: string
          severity: Database["public"]["Enums"]["announcement_severity"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          published_at?: string
          severity?: Database["public"]["Enums"]["announcement_severity"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          pinned?: boolean
          published_at?: string
          severity?: Database["public"]["Enums"]["announcement_severity"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      article_attributes: {
        Row: {
          art_nr: string
          attr_key: string
          attr_label: string | null
          attr_value: string | null
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          art_nr: string
          attr_key: string
          attr_label?: string | null
          attr_value?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          art_nr?: string
          attr_key?: string
          attr_label?: string | null
          attr_value?: string | null
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_attributes_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
        ]
      }
      article_bom: {
        Row: {
          a_kz: boolean | null
          anfahrmg: number | null
          anzahl: number | null
          ausschuss: number | null
          breite: number | null
          component_art_nr: string
          component_art_stat: string | null
          component_bezeichnung: string | null
          component_kennung: string | null
          component_matchcode: string | null
          et_kz: boolean | null
          hoehe: number | null
          id: string
          kst: string | null
          kst_label: string | null
          laenge_mm: number | null
          me: string | null
          mehrm_ber: number | null
          mehrm_me: number | null
          menge: number | null
          parent_art_nr: string
          pos: string | null
          set_kz: boolean | null
          updated_at: string
          v_position: string | null
        }
        Insert: {
          a_kz?: boolean | null
          anfahrmg?: number | null
          anzahl?: number | null
          ausschuss?: number | null
          breite?: number | null
          component_art_nr: string
          component_art_stat?: string | null
          component_bezeichnung?: string | null
          component_kennung?: string | null
          component_matchcode?: string | null
          et_kz?: boolean | null
          hoehe?: number | null
          id?: string
          kst?: string | null
          kst_label?: string | null
          laenge_mm?: number | null
          me?: string | null
          mehrm_ber?: number | null
          mehrm_me?: number | null
          menge?: number | null
          parent_art_nr: string
          pos?: string | null
          set_kz?: boolean | null
          updated_at?: string
          v_position?: string | null
        }
        Update: {
          a_kz?: boolean | null
          anfahrmg?: number | null
          anzahl?: number | null
          ausschuss?: number | null
          breite?: number | null
          component_art_nr?: string
          component_art_stat?: string | null
          component_bezeichnung?: string | null
          component_kennung?: string | null
          component_matchcode?: string | null
          et_kz?: boolean | null
          hoehe?: number | null
          id?: string
          kst?: string | null
          kst_label?: string | null
          laenge_mm?: number | null
          me?: string | null
          mehrm_ber?: number | null
          mehrm_me?: number | null
          menge?: number | null
          parent_art_nr?: string
          pos?: string | null
          set_kz?: boolean | null
          updated_at?: string
          v_position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_bom_parent_art_nr_fkey"
            columns: ["parent_art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
        ]
      }
      article_customer_refs: {
        Row: {
          aend_dat: string | null
          aend_ind: string | null
          aend_nr: string | null
          art_kunde: string | null
          art_nr: string
          bez_kunde: string | null
          ean_einz: string | null
          ean_samm: string | null
          id: string
          kunden_nr: string
          la_datum: string | null
          la_menge: number | null
          la_preis: number | null
          matchcode: string | null
          me: string | null
          memo: string | null
          rtz_kz: string | null
          updated_at: string
          version_nr: string | null
        }
        Insert: {
          aend_dat?: string | null
          aend_ind?: string | null
          aend_nr?: string | null
          art_kunde?: string | null
          art_nr: string
          bez_kunde?: string | null
          ean_einz?: string | null
          ean_samm?: string | null
          id?: string
          kunden_nr: string
          la_datum?: string | null
          la_menge?: number | null
          la_preis?: number | null
          matchcode?: string | null
          me?: string | null
          memo?: string | null
          rtz_kz?: string | null
          updated_at?: string
          version_nr?: string | null
        }
        Update: {
          aend_dat?: string | null
          aend_ind?: string | null
          aend_nr?: string | null
          art_kunde?: string | null
          art_nr?: string
          bez_kunde?: string | null
          ean_einz?: string | null
          ean_samm?: string | null
          id?: string
          kunden_nr?: string
          la_datum?: string | null
          la_menge?: number | null
          la_preis?: number | null
          matchcode?: string | null
          me?: string | null
          memo?: string | null
          rtz_kz?: string | null
          updated_at?: string
          version_nr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_customer_refs_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
        ]
      }
      article_import_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_details: Json | null
          file_name: string
          id: string
          import_type: string
          imported_by: string | null
          rows_failed: number | null
          rows_inserted: number | null
          rows_processed: number | null
          rows_updated: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          file_name: string
          id?: string
          import_type: string
          imported_by?: string | null
          rows_failed?: number | null
          rows_inserted?: number | null
          rows_processed?: number | null
          rows_updated?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          file_name?: string
          id?: string
          import_type?: string
          imported_by?: string | null
          rows_failed?: number | null
          rows_inserted?: number | null
          rows_processed?: number | null
          rows_updated?: number | null
        }
        Relationships: []
      }
      article_price_list_items: {
        Row: {
          art_nr: string
          bereich: string | null
          bez_pl: string | null
          br_preis: number | null
          id: string
          m_vk_preis: number | null
          me: string | null
          menge_bis: number | null
          menge_von: number | null
          pe: number | null
          pf_kz: boolean | null
          prl_nr: string
          rab: number | null
          updated_at: string
          vk_preis: number | null
          waehrung: string | null
        }
        Insert: {
          art_nr: string
          bereich?: string | null
          bez_pl?: string | null
          br_preis?: number | null
          id?: string
          m_vk_preis?: number | null
          me?: string | null
          menge_bis?: number | null
          menge_von?: number | null
          pe?: number | null
          pf_kz?: boolean | null
          prl_nr: string
          rab?: number | null
          updated_at?: string
          vk_preis?: number | null
          waehrung?: string | null
        }
        Update: {
          art_nr?: string
          bereich?: string | null
          bez_pl?: string | null
          br_preis?: number | null
          id?: string
          m_vk_preis?: number | null
          me?: string | null
          menge_bis?: number | null
          menge_von?: number | null
          pe?: number | null
          pf_kz?: boolean | null
          prl_nr?: string
          rab?: number | null
          updated_at?: string
          vk_preis?: number | null
          waehrung?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_price_list_items_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
        ]
      }
      article_price_lists: {
        Row: {
          bezeichnung: string | null
          prl_nr: string
          updated_at: string
        }
        Insert: {
          bezeichnung?: string | null
          prl_nr: string
          updated_at?: string
        }
        Update: {
          bezeichnung?: string | null
          prl_nr?: string
          updated_at?: string
        }
        Relationships: []
      }
      article_prices: {
        Row: {
          abwertung: number | null
          art_nr: string
          bewertungspreis: number | null
          buchung: string | null
          dispo_lager: number | null
          durchschnittspreis: number | null
          durchschnittspreis_dat: string | null
          einkaufspreis: number | null
          einkaufspreis_dat: string | null
          inventur: string | null
          letzter_ep: number | null
          letzter_ep_dat: string | null
          standardpreis: number | null
          standardpreis_dat: string | null
          updated_at: string
          waehrung: string | null
        }
        Insert: {
          abwertung?: number | null
          art_nr: string
          bewertungspreis?: number | null
          buchung?: string | null
          dispo_lager?: number | null
          durchschnittspreis?: number | null
          durchschnittspreis_dat?: string | null
          einkaufspreis?: number | null
          einkaufspreis_dat?: string | null
          inventur?: string | null
          letzter_ep?: number | null
          letzter_ep_dat?: string | null
          standardpreis?: number | null
          standardpreis_dat?: string | null
          updated_at?: string
          waehrung?: string | null
        }
        Update: {
          abwertung?: number | null
          art_nr?: string
          bewertungspreis?: number | null
          buchung?: string | null
          dispo_lager?: number | null
          durchschnittspreis?: number | null
          durchschnittspreis_dat?: string | null
          einkaufspreis?: number | null
          einkaufspreis_dat?: string | null
          inventur?: string | null
          letzter_ep?: number | null
          letzter_ep_dat?: string | null
          standardpreis?: number | null
          standardpreis_dat?: string | null
          updated_at?: string
          waehrung?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_prices_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: true
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
        ]
      }
      article_supplier_refs: {
        Row: {
          art_lief: string | null
          art_nr: string
          bestell_nr: string | null
          bez_lief: string | null
          dat_a_lz: string | null
          datum_l: string | null
          folge: string | null
          id: string
          lb_datum: string | null
          lb_menge: number | null
          lb_preis: number | null
          lief_nr: string
          lieferzeit: number | null
          lieferzeit_a: number | null
          me_liefer: string | null
          me_preis: string | null
          name_1: string | null
          updated_at: string
        }
        Insert: {
          art_lief?: string | null
          art_nr: string
          bestell_nr?: string | null
          bez_lief?: string | null
          dat_a_lz?: string | null
          datum_l?: string | null
          folge?: string | null
          id?: string
          lb_datum?: string | null
          lb_menge?: number | null
          lb_preis?: number | null
          lief_nr: string
          lieferzeit?: number | null
          lieferzeit_a?: number | null
          me_liefer?: string | null
          me_preis?: string | null
          name_1?: string | null
          updated_at?: string
        }
        Update: {
          art_lief?: string | null
          art_nr?: string
          bestell_nr?: string | null
          bez_lief?: string | null
          dat_a_lz?: string | null
          datum_l?: string | null
          folge?: string | null
          id?: string
          lb_datum?: string | null
          lb_menge?: number | null
          lb_preis?: number | null
          lief_nr?: string
          lieferzeit?: number | null
          lieferzeit_a?: number | null
          me_liefer?: string | null
          me_preis?: string | null
          name_1?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_supplier_refs_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
        ]
      }
      articles: {
        Row: {
          aend_dat: string | null
          aend_ind: string | null
          aend_nr: string | null
          art_gr: string | null
          art_nr: string
          art_stat: string | null
          art_stat_label: string | null
          bautyp: string | null
          bezeich_1: string | null
          bezeich_2: string | null
          created_at: string
          dispo_kz: string | null
          dispo_kz_label: string | null
          ger_lfd_nr: string | null
          is_blocked: boolean | null
          kennung: string | null
          kennung_label: string | null
          mass_1: string | null
          mat_art: string | null
          matchcode: string | null
          mb_menge: number | null
          me: string | null
          memo_ext: string | null
          mwst_gr: string | null
          mwst_gr_label: string | null
          pe: number | null
          t_art: string | null
          updated_at: string
          updated_by: string | null
          verp_mg: number | null
          weber_art_nr: string | null
          zeichnung_nr: string | null
          zolltarif_nr: string | null
        }
        Insert: {
          aend_dat?: string | null
          aend_ind?: string | null
          aend_nr?: string | null
          art_gr?: string | null
          art_nr: string
          art_stat?: string | null
          art_stat_label?: string | null
          bautyp?: string | null
          bezeich_1?: string | null
          bezeich_2?: string | null
          created_at?: string
          dispo_kz?: string | null
          dispo_kz_label?: string | null
          ger_lfd_nr?: string | null
          is_blocked?: boolean | null
          kennung?: string | null
          kennung_label?: string | null
          mass_1?: string | null
          mat_art?: string | null
          matchcode?: string | null
          mb_menge?: number | null
          me?: string | null
          memo_ext?: string | null
          mwst_gr?: string | null
          mwst_gr_label?: string | null
          pe?: number | null
          t_art?: string | null
          updated_at?: string
          updated_by?: string | null
          verp_mg?: number | null
          weber_art_nr?: string | null
          zeichnung_nr?: string | null
          zolltarif_nr?: string | null
        }
        Update: {
          aend_dat?: string | null
          aend_ind?: string | null
          aend_nr?: string | null
          art_gr?: string | null
          art_nr?: string
          art_stat?: string | null
          art_stat_label?: string | null
          bautyp?: string | null
          bezeich_1?: string | null
          bezeich_2?: string | null
          created_at?: string
          dispo_kz?: string | null
          dispo_kz_label?: string | null
          ger_lfd_nr?: string | null
          is_blocked?: boolean | null
          kennung?: string | null
          kennung_label?: string | null
          mass_1?: string | null
          mat_art?: string | null
          matchcode?: string | null
          mb_menge?: number | null
          me?: string | null
          memo_ext?: string | null
          mwst_gr?: string | null
          mwst_gr_label?: string | null
          pe?: number | null
          t_art?: string | null
          updated_at?: string
          updated_by?: string | null
          verp_mg?: number | null
          weber_art_nr?: string | null
          zeichnung_nr?: string | null
          zolltarif_nr?: string | null
        }
        Relationships: []
      }
      backups: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          note: string | null
          rows_count: number | null
          size_bytes: number | null
          status: string
          storage_path: string
          tables_count: number | null
          trigger: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          note?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          tables_count?: number | null
          trigger: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          note?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          tables_count?: number | null
          trigger?: string
        }
        Relationships: []
      }
      case_activity: {
        Row: {
          action: string
          actor_id: string | null
          case_id: string
          created_at: string
          field: string | null
          id: string
          message: string | null
          new_value: string | null
          old_value: string | null
          task_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          case_id: string
          created_at?: string
          field?: string | null
          id?: string
          message?: string | null
          new_value?: string | null
          old_value?: string | null
          task_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          case_id?: string
          created_at?: string
          field?: string | null
          id?: string
          message?: string | null
          new_value?: string | null
          old_value?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_activity_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "case_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      case_chat_attachments: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "case_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_chat_messages: {
        Row: {
          author_id: string
          body: string
          case_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          pinned: boolean
          pinned_at: string | null
          pinned_by: string | null
          reply_to_id: string | null
          system_kind: string | null
          system_payload: Json | null
        }
        Insert: {
          author_id: string
          body?: string
          case_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinned?: boolean
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: string | null
          system_kind?: string | null
          system_payload?: Json | null
        }
        Update: {
          author_id?: string
          body?: string
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinned?: boolean
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: string | null
          system_kind?: string | null
          system_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "case_chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "case_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_chat_mutes: {
        Row: {
          case_id: string
          muted_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          muted_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          muted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      case_chat_reactions: {
        Row: {
          case_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "case_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      case_chat_reads: {
        Row: {
          case_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      case_email_attachments: {
        Row: {
          case_id: string
          created_at: string
          email_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          case_id: string
          created_at?: string
          email_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          case_id?: string
          created_at?: string
          email_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_email_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "case_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      case_emails: {
        Row: {
          body_html: string | null
          body_plain: string | null
          case_id: string
          created_at: string
          from_email: string
          from_name: string | null
          id: string
          message_id: string | null
          note_id: string | null
          raw: Json | null
          received_at: string
          subject: string | null
          to_email: string | null
        }
        Insert: {
          body_html?: string | null
          body_plain?: string | null
          case_id: string
          created_at?: string
          from_email: string
          from_name?: string | null
          id?: string
          message_id?: string | null
          note_id?: string | null
          raw?: Json | null
          received_at?: string
          subject?: string | null
          to_email?: string | null
        }
        Update: {
          body_html?: string | null
          body_plain?: string | null
          case_id?: string
          created_at?: string
          from_email?: string
          from_name?: string | null
          id?: string
          message_id?: string | null
          note_id?: string | null
          raw?: Json | null
          received_at?: string
          subject?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_emails_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_emails_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "case_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      case_note_attachments: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          note_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          note_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          note_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "case_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          author_id: string
          body: string
          case_id: string
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          pinned: boolean
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          case_id: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          pinned?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          case_id?: string
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          pinned?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_tasks: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          assigned_to: string | null
          case_id: string
          completed: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_at: string | null
          id: string
          sort_order: number
          status: string
          title: string
          urgency: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          case_id: string
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          sort_order?: number
          status?: string
          title: string
          urgency?: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assigned_to?: string | null
          case_id?: string
          completed?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          sort_order?: number
          status?: string
          title?: string
          urgency?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      case_template_departments: {
        Row: {
          department_id: string
          id: string
          template_id: string
        }
        Insert: {
          department_id: string
          id?: string
          template_id: string
        }
        Update: {
          department_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_template_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_template_departments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "case_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      case_template_tasks: {
        Row: {
          assigned_role: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          assigned_role?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          order_index?: number
          template_id: string
          title: string
        }
        Update: {
          assigned_role?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_template_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "case_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      case_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_required: boolean
          id: string
          last_used_at: string | null
          lock_mode: string
          sequential_mode: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_required?: boolean
          id?: string
          last_used_at?: string | null
          lock_mode?: string
          sequential_mode?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_required?: boolean
          id?: string
          last_used_at?: string | null
          lock_mode?: string
          sequential_mode?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          assignee_id: string | null
          case_no: string
          case_number: string | null
          client_name: string | null
          closed_at: string | null
          closed_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_no: string | null
          deleted: boolean
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          due_at: string | null
          due_date_corrected_at: string | null
          due_date_corrected_by: string | null
          due_required: boolean
          effective_urgency: number
          estimated_hours: number | null
          id: string
          internal_area_code: string | null
          last_changed_at: string | null
          last_changed_by: string | null
          lock_mode: string
          note: string | null
          priority_order: number
          product_code: string | null
          project_article_no: string | null
          project_duration: string | null
          project_id: string | null
          project_name: string
          quantity: number | null
          received_at: string | null
          secondary_check_by: string | null
          secondary_check_confirmed_at: string | null
          sequential_mode: boolean
          sop: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["case_status"]
          urgency: number
          urgency_override: boolean
          urgency_override_at: string | null
          urgency_override_by: string | null
          version: number
          visibility: string
          watchers: string[]
        }
        Insert: {
          assignee_id?: string | null
          case_no?: string
          case_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: string | null
          deleted?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          due_at?: string | null
          due_date_corrected_at?: string | null
          due_date_corrected_by?: string | null
          due_required?: boolean
          effective_urgency?: number
          estimated_hours?: number | null
          id?: string
          internal_area_code?: string | null
          last_changed_at?: string | null
          last_changed_by?: string | null
          lock_mode?: string
          note?: string | null
          priority_order?: number
          product_code?: string | null
          project_article_no?: string | null
          project_duration?: string | null
          project_id?: string | null
          project_name: string
          quantity?: number | null
          received_at?: string | null
          secondary_check_by?: string | null
          secondary_check_confirmed_at?: string | null
          sequential_mode?: boolean
          sop?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          urgency?: number
          urgency_override?: boolean
          urgency_override_at?: string | null
          urgency_override_by?: string | null
          version?: number
          visibility?: string
          watchers?: string[]
        }
        Update: {
          assignee_id?: string | null
          case_no?: string
          case_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: string | null
          deleted?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          due_at?: string | null
          due_date_corrected_at?: string | null
          due_date_corrected_by?: string | null
          due_required?: boolean
          effective_urgency?: number
          estimated_hours?: number | null
          id?: string
          internal_area_code?: string | null
          last_changed_at?: string | null
          last_changed_by?: string | null
          lock_mode?: string
          note?: string | null
          priority_order?: number
          product_code?: string | null
          project_article_no?: string | null
          project_duration?: string | null
          project_id?: string | null
          project_name?: string
          quantity?: number | null
          received_at?: string | null
          secondary_check_by?: string | null
          secondary_check_confirmed_at?: string | null
          sequential_mode?: boolean
          sop?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          urgency?: number
          urgency_override?: boolean
          urgency_override_at?: string | null
          urgency_override_by?: string | null
          version?: number
          visibility?: string
          watchers?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cases_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_due_date_corrected_by_fkey"
            columns: ["due_date_corrected_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_last_changed_by_fkey"
            columns: ["last_changed_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_secondary_check_by_fkey"
            columns: ["secondary_check_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          country: string | null
          created_at: string
          customer_no: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          owner_id: string | null
          type: Database["public"]["Enums"]["company_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string
          customer_no?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string
          customer_no?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      counters: {
        Row: {
          id: string
          key: string
          value: number
        }
        Insert: {
          id?: string
          key: string
          value?: number
        }
        Update: {
          id?: string
          key?: string
          value?: number
        }
        Relationships: []
      }
      crm_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          auto_generated: boolean
          body: string | null
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          due_at: string | null
          id: string
          owner_id: string | null
          subject: string
          type: Database["public"]["Enums"]["crm_activity_type"]
        }
        Insert: {
          auto_generated?: boolean
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string | null
          subject: string
          type: Database["public"]["Enums"]["crm_activity_type"]
        }
        Update: {
          auto_generated?: boolean
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          due_at?: string | null
          id?: string
          owner_id?: string | null
          subject?: string
          type?: Database["public"]["Enums"]["crm_activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_tracking: {
        Row: {
          activity_id: string | null
          bounced_at: string | null
          clicked_at: string | null
          contact_id: string | null
          enrollment_id: string | null
          id: string
          opened_at: string | null
          provider_message_id: string | null
          sent_at: string
          status: string
          step_number: number | null
          subject: string | null
          to_email: string
        }
        Insert: {
          activity_id?: string | null
          bounced_at?: string | null
          clicked_at?: string | null
          contact_id?: string | null
          enrollment_id?: string | null
          id?: string
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string
          status?: string
          step_number?: number | null
          subject?: string | null
          to_email: string
        }
        Update: {
          activity_id?: string | null
          bounced_at?: string | null
          clicked_at?: string | null
          contact_id?: string | null
          enrollment_id?: string | null
          id?: string
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string
          status?: string
          step_number?: number | null
          subject?: string | null
          to_email?: string
        }
        Relationships: []
      }
      crm_unsubscribes: {
        Row: {
          contact_id: string
          email: string | null
          id: string
          is_unsubscribed: boolean
          reason: string | null
          unsubscribed_at: string
        }
        Insert: {
          contact_id: string
          email?: string | null
          id?: string
          is_unsubscribed?: boolean
          reason?: string | null
          unsubscribed_at?: string
        }
        Update: {
          contact_id?: string
          email?: string | null
          id?: string
          is_unsubscribed?: boolean
          reason?: string | null
          unsubscribed_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          customer_no: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          customer_no: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          customer_no?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      deal_items: {
        Row: {
          deal_id: string
          description: string | null
          discount_pct: number
          id: string
          product_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          deal_id: string
          description?: string | null
          discount_pct?: number
          id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          deal_id?: string
          description?: string | null
          discount_pct?: number
          id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deal_no: string
          delivery_address: string | null
          id: string
          lost_details: string | null
          lost_reason_id: string | null
          owner_id: string | null
          primary_contact_id: string | null
          quantity: number | null
          sop: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at: string
          title: string
          updated_at: string
          value_estimated: number | null
          value_final: number | null
          won_case_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_no?: string
          delivery_address?: string | null
          id?: string
          lost_details?: string | null
          lost_reason_id?: string | null
          owner_id?: string | null
          primary_contact_id?: string | null
          quantity?: number | null
          sop?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at?: string
          title: string
          updated_at?: string
          value_estimated?: number | null
          value_final?: number | null
          won_case_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_no?: string
          delivery_address?: string | null
          id?: string
          lost_details?: string | null
          lost_reason_id?: string | null
          owner_id?: string | null
          primary_contact_id?: string | null
          quantity?: number | null
          sop?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at?: string
          title?: string
          updated_at?: string
          value_estimated?: number | null
          value_final?: number | null
          won_case_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lost_reason_id_fkey"
            columns: ["lost_reason_id"]
            isOneToOne: false
            referencedRelation: "lost_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_cases: {
        Row: {
          assignee_id: string | null
          case_created_at: string | null
          case_id: string
          case_no: string | null
          client_name: string | null
          created_by: string | null
          customer_no: string | null
          deleted_at: string
          deleted_by: string | null
          department_id: string | null
          due_at: string | null
          id: string
          project_id: string | null
          project_name: string | null
          snapshot: Json | null
          status: string | null
        }
        Insert: {
          assignee_id?: string | null
          case_created_at?: string | null
          case_id: string
          case_no?: string | null
          client_name?: string | null
          created_by?: string | null
          customer_no?: string | null
          deleted_at?: string
          deleted_by?: string | null
          department_id?: string | null
          due_at?: string | null
          id?: string
          project_id?: string | null
          project_name?: string | null
          snapshot?: Json | null
          status?: string | null
        }
        Update: {
          assignee_id?: string | null
          case_created_at?: string | null
          case_id?: string
          case_no?: string | null
          client_name?: string | null
          created_by?: string | null
          customer_no?: string | null
          deleted_at?: string
          deleted_by?: string | null
          department_id?: string | null
          due_at?: string | null
          id?: string
          project_id?: string | null
          project_name?: string | null
          snapshot?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      department_members: {
        Row: {
          created_at: string
          department_id: string
          id: string
          role: Database["public"]["Enums"]["dept_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          role?: Database["public"]["Enums"]["dept_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          role?: Database["public"]["Enums"]["dept_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_permissions: {
        Row: {
          created_at: string
          department_id: string
          id: string
          permission: Database["public"]["Enums"]["dept_permission"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          permission?: Database["public"]["Enums"]["dept_permission"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          permission?: Database["public"]["Enums"]["dept_permission"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          manager_user_id: string | null
          name: string
          owner_id: string | null
          parent_id: string | null
          private_inbox: boolean
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_user_id?: string | null
          name: string
          owner_id?: string | null
          parent_id?: string | null
          private_inbox?: boolean
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_user_id?: string | null
          name?: string
          owner_id?: string | null
          parent_id?: string | null
          private_inbox?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "departments_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_category_permissions: {
        Row: {
          category_id: string
          department_id: string | null
          granted_at: string
          granted_by: string | null
          id: string
          permission: string
          principal_type: string
          user_id: string | null
        }
        Insert: {
          category_id: string
          department_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          principal_type: string
          user_id?: string | null
        }
        Update: {
          category_id?: string
          department_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          principal_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_category_permissions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "insurance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_category_permissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      document_intake_log: {
        Row: {
          action: string
          attachment_id: string | null
          change_note: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          mtiq_draft_id: string | null
          new_version_no: number | null
          signals: Json
        }
        Insert: {
          action: string
          attachment_id?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          mtiq_draft_id?: string | null
          new_version_no?: number | null
          signals?: Json
        }
        Update: {
          action?: string
          attachment_id?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          mtiq_draft_id?: string | null
          new_version_no?: number | null
          signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "document_intake_log_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "mtiq_draft_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_log_mtiq_draft_id_fkey"
            columns: ["mtiq_draft_id"]
            isOneToOne: false
            referencedRelation: "mtiq_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          document_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity_type"]
          id: string
          linked_at: string
          linked_by: string
          role: string | null
        }
        Insert: {
          document_id: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity_type"]
          id?: string
          linked_at?: string
          linked_by: string
          role?: string | null
        }
        Update: {
          document_id?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["document_entity_type"]
          id?: string
          linked_at?: string
          linked_by?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          auto_apply_threshold: number | null
          classification_hints: string | null
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          extraction_schema: Json
          icon: string | null
          id: string
          is_active: boolean
          label_de: string
          sort_order: number
          target_table: string | null
          updated_at: string
        }
        Insert: {
          auto_apply_threshold?: number | null
          classification_hints?: string | null
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          extraction_schema?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          label_de: string
          sort_order?: number
          target_table?: string | null
          updated_at?: string
        }
        Update: {
          auto_apply_threshold?: number | null
          classification_hints?: string | null
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          extraction_schema?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          label_de?: string
          sort_order?: number
          target_table?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          change_note: string | null
          checksum_sha256: string | null
          document_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          version_no: number
        }
        Insert: {
          change_note?: string | null
          checksum_sha256?: string | null
          document_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
          version_no: number
        }
        Update: {
          change_note?: string | null
          checksum_sha256?: string | null
          document_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          category: string | null
          checksum_sha256: string | null
          created_at: string
          current_version: number
          description: string | null
          file_name: string
          id: string
          mime_type: string | null
          owner_id: string
          size_bytes: number
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          checksum_sha256?: string | null
          created_at?: string
          current_version?: number
          description?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          owner_id: string
          size_bytes?: number
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          checksum_sha256?: string | null
          created_at?: string
          current_version?: number
          description?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          owner_id?: string
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_corrections: {
        Row: {
          ai_value: Json | null
          corrected_at: string
          corrected_by: string | null
          document_type_id: string | null
          field_path: string
          id: string
          inbox_document_id: string
          user_value: Json | null
        }
        Insert: {
          ai_value?: Json | null
          corrected_at?: string
          corrected_by?: string | null
          document_type_id?: string | null
          field_path: string
          id?: string
          inbox_document_id: string
          user_value?: Json | null
        }
        Update: {
          ai_value?: Json | null
          corrected_at?: string
          corrected_by?: string | null
          document_type_id?: string | null
          field_path?: string
          id?: string
          inbox_document_id?: string
          user_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_corrections_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_corrections_inbox_document_id_fkey"
            columns: ["inbox_document_id"]
            isOneToOne: false
            referencedRelation: "inbox_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_documents: {
        Row: {
          classification_confidence: number | null
          classification_reasoning: string | null
          classified_type_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          extracted_data: Json
          filename: string | null
          from_email: string | null
          from_name: string | null
          id: string
          inbox_no: string | null
          linked_id: string | null
          linked_table: string | null
          raw_email_id: string | null
          received_at: string
          status: string
          storage_path: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          classification_confidence?: number | null
          classification_reasoning?: string | null
          classified_type_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          extracted_data?: Json
          filename?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          inbox_no?: string | null
          linked_id?: string | null
          linked_table?: string | null
          raw_email_id?: string | null
          received_at?: string
          status?: string
          storage_path?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          classification_confidence?: number | null
          classification_reasoning?: string | null
          classified_type_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          extracted_data?: Json
          filename?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          inbox_no?: string | null
          linked_id?: string | null
          linked_table?: string | null
          raw_email_id?: string | null
          received_at?: string
          status?: string
          storage_path?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_documents_classified_type_id_fkey"
            columns: ["classified_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "insurance_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_documents: {
        Row: {
          description: string | null
          doc_kind: string
          file_name: string
          file_size: number | null
          id: string
          is_current: boolean
          mime_type: string | null
          policy_id: string
          replaced_by: string | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          description?: string | null
          doc_kind?: string
          file_name: string
          file_size?: number | null
          id?: string
          is_current?: boolean
          mime_type?: string | null
          policy_id: string
          replaced_by?: string | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          description?: string | null
          doc_kind?: string
          file_name?: string
          file_size?: number | null
          id?: string
          is_current?: boolean
          mime_type?: string | null
          policy_id?: string
          replaced_by?: string | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "insurance_documents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_documents_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "insurance_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_intake_corrections: {
        Row: {
          ai_value: string | null
          corrected_by: string | null
          corrected_value: string | null
          created_at: string
          field: string
          id: string
          policy_id: string
        }
        Insert: {
          ai_value?: string | null
          corrected_by?: string | null
          corrected_value?: string | null
          created_at?: string
          field: string
          id?: string
          policy_id: string
        }
        Update: {
          ai_value?: string | null
          corrected_by?: string | null
          corrected_value?: string | null
          created_at?: string
          field?: string
          id?: string
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_intake_corrections_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          category_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          insured_object: string | null
          name: string
          notes: string | null
          notice_period_days: number | null
          policy_number: string | null
          premium_amount: number | null
          premium_currency: string | null
          premium_interval: string | null
          provider: string | null
          renewal_date: string | null
          search_tsv: unknown
          source: string
          start_date: string | null
          status: string
          tags: string[] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          insured_object?: string | null
          name: string
          notes?: string | null
          notice_period_days?: number | null
          policy_number?: string | null
          premium_amount?: number | null
          premium_currency?: string | null
          premium_interval?: string | null
          provider?: string | null
          renewal_date?: string | null
          search_tsv?: unknown
          source?: string
          start_date?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          insured_object?: string | null
          name?: string
          notes?: string | null
          notice_period_days?: number | null
          policy_number?: string | null
          premium_amount?: number | null
          premium_currency?: string | null
          premium_interval?: string | null
          provider?: string | null
          renewal_date?: string | null
          search_tsv?: unknown
          source?: string
          start_date?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "insurance_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          config: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      internal_areas: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      issos_documents: {
        Row: {
          ai_reasoning: string | null
          created_at: string
          created_by: string | null
          document_type: string | null
          file_name: string
          file_size: number | null
          id: string
          intake_id: string
          mime_type: string | null
          notes: string | null
          received_at: string
          sender_hint: string | null
          snapshot_date: string | null
          source_email_from: string | null
          source_email_message_id: string | null
          source_email_subject: string | null
          status: string
          storage_path: string
          summary: string | null
          tags: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          intake_id?: string
          mime_type?: string | null
          notes?: string | null
          received_at?: string
          sender_hint?: string | null
          snapshot_date?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_subject?: string | null
          status?: string
          storage_path: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          intake_id?: string
          mime_type?: string | null
          notes?: string | null
          received_at?: string
          sender_hint?: string | null
          snapshot_date?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_subject?: string | null
          status?: string
          storage_path?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          company_name: string
          contact_name: string | null
          converted_company_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          industry: string | null
          notes: string | null
          phone: string | null
          rejection_reason: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          converted_company_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          phone?: string | null
          rejection_reason?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          converted_company_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          notes?: string | null
          phone?: string | null
          rejection_reason?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      lost_reasons: {
        Row: {
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      map_custom_edges: {
        Row: {
          created_at: string
          created_by: string | null
          from_id: string
          from_type: string
          id: string
          label: string | null
          to_id: string
          to_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_id: string
          from_type: string
          id?: string
          label?: string | null
          to_id: string
          to_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_id?: string
          from_type?: string
          id?: string
          label?: string | null
          to_id?: string
          to_type?: string
        }
        Relationships: []
      }
      map_custom_nodes: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      map_node_positions: {
        Row: {
          node_id: string
          node_type: string
          updated_at: string
          updated_by: string | null
          x: number
          y: number
        }
        Insert: {
          node_id: string
          node_type: string
          updated_at?: string
          updated_by?: string | null
          x: number
          y: number
        }
        Update: {
          node_id?: string
          node_type?: string
          updated_at?: string
          updated_by?: string | null
          x?: number
          y?: number
        }
        Relationships: []
      }
      mtiq_draft_attachments: {
        Row: {
          created_at: string
          draft_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          source: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "mtiq_draft_attachments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "mtiq_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      mtiq_draft_corrections: {
        Row: {
          corrected_fields: Json
          created_at: string
          created_by: string | null
          draft_id: string | null
          id: string
          original_fields: Json
        }
        Insert: {
          corrected_fields?: Json
          created_at?: string
          created_by?: string | null
          draft_id?: string | null
          id?: string
          original_fields?: Json
        }
        Update: {
          corrected_fields?: Json
          created_at?: string
          created_by?: string | null
          draft_id?: string | null
          id?: string
          original_fields?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mtiq_draft_corrections_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "mtiq_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      mtiq_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_match_proposals: Json
          created_at: string
          created_by: string | null
          draft_assignee_id: string | null
          draft_client_name: string | null
          draft_customer_no: string | null
          draft_department: string | null
          draft_description: string | null
          draft_due_date: string | null
          draft_estimated_hours: number | null
          draft_internal_area_code: string | null
          draft_note: string | null
          draft_priority: string | null
          draft_product_code: string | null
          draft_project_article_no: string | null
          draft_project_duration: string | null
          draft_project_id: string | null
          draft_quantity: number | null
          draft_received_at: string | null
          draft_sop: string | null
          draft_tasks: Json
          draft_team_id: string | null
          draft_template_id: string | null
          draft_title: string | null
          id: string
          mtiq_generated_note: string | null
          mtiq_reasoning: string | null
          original_snapshot: Json | null
          possible_duplicate_of: string | null
          recommended_reason: string | null
          route: string
          route_confirmed_at: string | null
          route_confirmed_by: string | null
          source_email_body: string | null
          source_email_from: string | null
          source_email_message_id: string | null
          source_email_subject: string | null
          status: string
          vorgang_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_match_proposals?: Json
          created_at?: string
          created_by?: string | null
          draft_assignee_id?: string | null
          draft_client_name?: string | null
          draft_customer_no?: string | null
          draft_department?: string | null
          draft_description?: string | null
          draft_due_date?: string | null
          draft_estimated_hours?: number | null
          draft_internal_area_code?: string | null
          draft_note?: string | null
          draft_priority?: string | null
          draft_product_code?: string | null
          draft_project_article_no?: string | null
          draft_project_duration?: string | null
          draft_project_id?: string | null
          draft_quantity?: number | null
          draft_received_at?: string | null
          draft_sop?: string | null
          draft_tasks?: Json
          draft_team_id?: string | null
          draft_template_id?: string | null
          draft_title?: string | null
          id?: string
          mtiq_generated_note?: string | null
          mtiq_reasoning?: string | null
          original_snapshot?: Json | null
          possible_duplicate_of?: string | null
          recommended_reason?: string | null
          route?: string
          route_confirmed_at?: string | null
          route_confirmed_by?: string | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_subject?: string | null
          status?: string
          vorgang_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_match_proposals?: Json
          created_at?: string
          created_by?: string | null
          draft_assignee_id?: string | null
          draft_client_name?: string | null
          draft_customer_no?: string | null
          draft_department?: string | null
          draft_description?: string | null
          draft_due_date?: string | null
          draft_estimated_hours?: number | null
          draft_internal_area_code?: string | null
          draft_note?: string | null
          draft_priority?: string | null
          draft_product_code?: string | null
          draft_project_article_no?: string | null
          draft_project_duration?: string | null
          draft_project_id?: string | null
          draft_quantity?: number | null
          draft_received_at?: string | null
          draft_sop?: string | null
          draft_tasks?: Json
          draft_team_id?: string | null
          draft_template_id?: string | null
          draft_title?: string | null
          id?: string
          mtiq_generated_note?: string | null
          mtiq_reasoning?: string | null
          original_snapshot?: Json | null
          possible_duplicate_of?: string | null
          recommended_reason?: string | null
          route?: string
          route_confirmed_at?: string | null
          route_confirmed_by?: string | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_subject?: string | null
          status?: string
          vorgang_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mtiq_drafts_possible_duplicate_of_fkey"
            columns: ["possible_duplicate_of"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtiq_drafts_vorgang_id_fkey"
            columns: ["vorgang_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      note_board_members: {
        Row: {
          board_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "note_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      note_boards: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          department_id: string | null
          description: string | null
          id: string
          name: string
          owner_id: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id: string
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_boards_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          archived_at: string | null
          author_id: string
          board_id: string
          checklist: Json
          color: string
          content: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          extra: Json
          fill_color: string | null
          height: number
          highlights: Json
          id: string
          kind: string
          pinned: boolean
          position_x: number
          position_y: number
          stroke_color: string | null
          updated_at: string
          width: number
          z_index: number
        }
        Insert: {
          archived_at?: string | null
          author_id: string
          board_id: string
          checklist?: Json
          color?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          extra?: Json
          fill_color?: string | null
          height?: number
          highlights?: Json
          id?: string
          kind?: string
          pinned?: boolean
          position_x?: number
          position_y?: number
          stroke_color?: string | null
          updated_at?: string
          width?: number
          z_index?: number
        }
        Update: {
          archived_at?: string | null
          author_id?: string
          board_id?: string
          checklist?: Json
          color?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          extra?: Json
          fill_color?: string | null
          height?: number
          highlights?: Json
          id?: string
          kind?: string
          pinned?: boolean
          position_x?: number
          position_y?: number
          stroke_color?: string | null
          updated_at?: string
          width?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "notes_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "note_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          id: string
          recipient_email: string
          sent_at: string
          type: string
          vorgang_id: string | null
        }
        Insert: {
          id?: string
          recipient_email: string
          sent_at?: string
          type: string
          vorgang_id?: string | null
        }
        Update: {
          id?: string
          recipient_email?: string
          sent_at?: string
          type?: string
          vorgang_id?: string | null
        }
        Relationships: []
      }
      offer_items: {
        Row: {
          art_nr: string | null
          description: string
          discount_pct: number
          id: string
          offer_id: string
          product_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          art_nr?: string | null
          description: string
          discount_pct?: number
          id?: string
          offer_id: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          art_nr?: string | null
          description?: string
          discount_pct?: number
          id?: string
          offer_id?: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          accepted_at: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          delivery_address: string | null
          id: string
          notes: string | null
          offer_no: string
          owner_id: string | null
          parent_offer_id: string | null
          payment_terms: string | null
          pdf_url: string | null
          primary_contact_id: string | null
          rejected_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["offer_status"]
          total: number
          updated_at: string
          valid_until: string | null
          version: number
        }
        Insert: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          delivery_address?: string | null
          id?: string
          notes?: string | null
          offer_no?: string
          owner_id?: string | null
          parent_offer_id?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          primary_contact_id?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Update: {
          accepted_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          delivery_address?: string | null
          id?: string
          notes?: string | null
          offer_no?: string
          owner_id?: string | null
          parent_offer_id?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          primary_contact_id?: string | null
          rejected_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          total?: number
          updated_at?: string
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      order_documents: {
        Row: {
          created_at: string
          doc_kind: string | null
          file_name: string
          file_size: number | null
          id: string
          is_current: boolean
          mime_type: string | null
          order_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_kind?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          is_current?: boolean
          mime_type?: string | null
          order_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_kind?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          is_current?: boolean
          mime_type?: string | null
          order_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_intake_corrections: {
        Row: {
          ai_value: Json | null
          corrected_by: string | null
          corrected_value: Json | null
          created_at: string
          field: string
          id: string
          order_id: string
        }
        Insert: {
          ai_value?: Json | null
          corrected_by?: string | null
          corrected_value?: Json | null
          created_at?: string
          field: string
          id?: string
          order_id: string
        }
        Update: {
          ai_value?: Json | null
          corrected_by?: string | null
          corrected_value?: Json | null
          created_at?: string
          field?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_intake_corrections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          art_nr: string | null
          created_at: string
          description: string
          id: string
          line_total: number | null
          notes: string | null
          order_id: string
          position: number
          quantity: number
          sku: string | null
          tax_rate: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          art_nr?: string | null
          created_at?: string
          description: string
          id?: string
          line_total?: number | null
          notes?: string | null
          order_id: string
          position?: number
          quantity?: number
          sku?: string | null
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          art_nr?: string | null
          created_at?: string
          description?: string
          id?: string
          line_total?: number | null
          notes?: string | null
          order_id?: string
          position?: number
          quantity?: number
          sku?: string | null
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_no: string | null
          delivery_date: string | null
          department_id: string | null
          external_order_no: string | null
          id: string
          notes: string | null
          order_date: string | null
          order_kind: string
          order_no: string
          payment_terms: string | null
          source: string
          status: string
          subtotal_amount: number | null
          tags: string[]
          tax_amount: number | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_no?: string | null
          delivery_date?: string | null
          department_id?: string | null
          external_order_no?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_kind?: string
          order_no?: string
          payment_terms?: string | null
          source?: string
          status?: string
          subtotal_amount?: number | null
          tags?: string[]
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_no?: string | null
          delivery_date?: string | null
          department_id?: string | null
          external_order_no?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_kind?: string
          order_no?: string
          payment_terms?: string | null
          source?: string
          status?: string
          subtotal_amount?: number | null
          tags?: string[]
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      portal_customers: {
        Row: {
          auth_user_id: string | null
          company_name: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          company_name?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          company_name?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_customers_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          created_at: string
          customer_tier: Database["public"]["Enums"]["customer_tier"]
          id: string
          is_active: boolean
          min_quantity: number
          price: number
          price_list_id: string | null
          product_id: string | null
          updated_at: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          customer_tier?: Database["public"]["Enums"]["customer_tier"]
          id?: string
          is_active?: boolean
          min_quantity?: number
          price?: number
          price_list_id?: string | null
          product_id?: string | null
          updated_at?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          customer_tier?: Database["public"]["Enums"]["customer_tier"]
          id?: string
          is_active?: boolean
          min_quantity?: number
          price?: number
          price_list_id?: string | null
          product_id?: string | null
          updated_at?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      product_requests: {
        Row: {
          approved_product_id: string | null
          article_number: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          product_name: string
          rejection_reason: string | null
          request_reason: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["product_request_status"]
          updated_at: string
        }
        Insert: {
          approved_product_id?: string | null
          article_number?: string | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          product_name: string
          rejection_reason?: string | null
          request_reason: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["product_request_status"]
          updated_at?: string
        }
        Update: {
          approved_product_id?: string | null
          article_number?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          product_name?: string
          rejection_reason?: string | null
          request_reason?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["product_request_status"]
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          field: string | null
          id: string
          message: string | null
          new_value: string | null
          old_value: string | null
          project_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          message?: string | null
          new_value?: string | null
          old_value?: string | null
          project_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          field?: string | null
          id?: string
          message?: string | null
          new_value?: string | null
          old_value?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          path: string
          project_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          path: string
          project_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          path?: string
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      project_protection: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          distributor_company_id: string | null
          distributor_name: string | null
          id: string
          notes: string | null
          owner_id: string | null
          product_id: string | null
          scope_detail: string | null
          scope_type: Database["public"]["Enums"]["protection_scope"]
          status: Database["public"]["Enums"]["protection_status"]
          valid_until: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          distributor_company_id?: string | null
          distributor_name?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          product_id?: string | null
          scope_detail?: string | null
          scope_type?: Database["public"]["Enums"]["protection_scope"]
          status?: Database["public"]["Enums"]["protection_status"]
          valid_until?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          distributor_company_id?: string | null
          distributor_name?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          product_id?: string | null
          scope_detail?: string | null
          scope_type?: Database["public"]["Enums"]["protection_scope"]
          status?: Database["public"]["Enums"]["protection_status"]
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_protection_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          name: string
          owner_id: string | null
          project_code: string | null
          project_number: string | null
          status: string
          updated_at: string
          urgency: number
          urgency_override: boolean
          urgency_override_at: string | null
          urgency_override_by: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          project_code?: string | null
          project_number?: string | null
          status?: string
          updated_at?: string
          urgency?: number
          urgency_override?: boolean
          urgency_override_at?: string | null
          urgency_override_by?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          project_code?: string | null
          project_number?: string | null
          status?: string
          updated_at?: string
          urgency?: number
          urgency_override?: boolean
          urgency_override_at?: string | null
          urgency_override_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      response_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string
          current_step: number
          id: string
          sequence_id: string
          started_at: string
          status: Database["public"]["Enums"]["sequence_enrollment_status"]
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          current_step?: number
          id?: string
          sequence_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["sequence_enrollment_status"]
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          current_step?: number
          id?: string
          sequence_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["sequence_enrollment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_step_executions: {
        Row: {
          enrollment_id: string
          executed_at: string
          executed_by: string | null
          id: string
          result: string | null
          step_id: string
        }
        Insert: {
          enrollment_id: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          result?: string | null
          step_id: string
        }
        Update: {
          enrollment_id?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          result?: string | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_step_executions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_step_executions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          body: string | null
          id: string
          order_index: number
          sequence_id: string
          subject: string | null
          task_assignee: string | null
          task_title: string | null
          type: string
          wait_days: number | null
        }
        Insert: {
          body?: string | null
          id?: string
          order_index: number
          sequence_id: string
          subject?: string | null
          task_assignee?: string | null
          task_title?: string | null
          type: string
          wait_days?: number | null
        }
        Update: {
          body?: string | null
          id?: string
          order_index?: number
          sequence_id?: string
          subject?: string | null
          task_assignee?: string | null
          task_title?: string | null
          type?: string
          wait_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          status?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          ai_triage: Json | null
          assigned_to: string | null
          case_id: string | null
          client_meta: Json | null
          closed_at: string | null
          created_at: string
          customer_id: string | null
          description: string
          id: string
          kind: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          reporter_user_id: string | null
          resolved_at: string | null
          route: string | null
          source: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          ticket_number: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_triage?: Json | null
          assigned_to?: string | null
          case_id?: string | null
          client_meta?: Json | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          description: string
          id?: string
          kind?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          reporter_user_id?: string | null
          resolved_at?: string | null
          route?: string | null
          source?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          ticket_number?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_triage?: Json | null
          assigned_to?: string | null
          case_id?: string | null
          client_meta?: Json | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string
          id?: string
          kind?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          reporter_user_id?: string | null
          resolved_at?: string | null
          route?: string | null
          source?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          ticket_number?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "portal_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_internal: boolean
          sender_id: string
          sender_type: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id: string
          sender_type: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id?: string
          sender_type?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          compact_tables: boolean
          dashboard_chart_range: string
          dashboard_status_filters: string[]
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          compact_tables?: boolean
          dashboard_chart_range?: string
          dashboard_status_filters?: string[]
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          compact_tables?: boolean
          dashboard_chart_range?: string
          dashboard_status_filters?: string[]
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          current_path: string | null
          last_active_at: string
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          current_path?: string | null
          last_active_at?: string
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          current_path?: string | null
          last_active_at?: string
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          active: boolean
          active_session_token: string | null
          avatar_url: string | null
          created_at: string
          department_id: string | null
          display_name: string
          id: string
          is_admin: boolean
          is_manager: boolean
          manager_id: string | null
          short_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_session_token?: string | null
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          display_name: string
          id: string
          is_admin?: boolean
          is_manager?: boolean
          manager_id?: string | null
          short_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_session_token?: string | null
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          display_name?: string
          id?: string
          is_admin?: boolean
          is_manager?: boolean
          manager_id?: string | null
          short_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_profile_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_profile_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_articles: {
        Row: {
          body: string
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "wiki_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      wiki_versions: {
        Row: {
          article_id: string
          body: string
          id: string
          saved_at: string
          saved_by: string | null
          title: string | null
        }
        Insert: {
          article_id: string
          body: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          title?: string | null
        }
        Update: {
          article_id?: string
          body?: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "wiki_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workflow_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_old_announcements: { Args: never; Returns: number }
      can_access_case_chat: {
        Args: { p_case_id: string; p_uid?: string }
        Returns: boolean
      }
      can_link_entity: {
        Args: {
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["document_entity_type"]
          p_uid?: string
        }
        Returns: boolean
      }
      can_read_board: {
        Args: { p_board_id: string; p_uid?: string }
        Returns: boolean
      }
      can_read_case: {
        Args: { p_case_id: string; p_uid?: string }
        Returns: boolean
      }
      can_read_dept: {
        Args: { p_dept_id: string; p_uid?: string }
        Returns: boolean
      }
      can_read_doc_category: {
        Args: { p_category_id: string; p_uid?: string }
        Returns: boolean
      }
      can_read_document: {
        Args: { p_document_id: string; p_uid?: string }
        Returns: boolean
      }
      can_write_board:
        | { Args: { _board_id: string }; Returns: boolean }
        | { Args: { p_board_id: string; p_uid?: string }; Returns: boolean }
      can_write_dept: {
        Args: { p_dept_id: string; p_uid?: string }
        Returns: boolean
      }
      can_write_doc_category: {
        Args: { p_category_id: string; p_uid?: string }
        Returns: boolean
      }
      can_write_document: {
        Args: { p_document_id: string; p_uid?: string }
        Returns: boolean
      }
      case_department: { Args: { p_case_id: string }; Returns: string }
      case_dept_owner: { Args: { p_case_id: string }; Returns: string }
      check_is_admin: { Args: { uid?: string }; Returns: boolean }
      check_is_manager: { Args: { uid?: string }; Returns: boolean }
      dept_has_matrix: { Args: { p_dept_id: string }; Returns: boolean }
      dept_member_role: {
        Args: { p_dept_id: string; p_uid: string }
        Returns: Database["public"]["Enums"]["dept_member_role"]
      }
      dept_owner: { Args: { p_dept_id: string }; Returns: string }
      generate_insurance_reminders: { Args: never; Returns: number }
      generate_order_no: { Args: never; Returns: string }
      get_case_chat_unread: {
        Args: { p_case_ids: string[] }
        Returns: {
          case_id: string
          last_message_at: string
          unread_count: number
        }[]
      }
      has_crm_access: { Args: { uid?: string }; Returns: boolean }
      has_dept_read: {
        Args: { p_dept_id: string; p_uid: string }
        Returns: boolean
      }
      has_dept_write: {
        Args: { p_dept_id: string; p_uid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insurance_policy_effective_status: {
        Args: { p: Database["public"]["Tables"]["insurance_policies"]["Row"] }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_any_dept_lead: { Args: { p_uid?: string }; Returns: boolean }
      is_board_member: {
        Args: { p_board_id: string; p_uid?: string }
        Returns: boolean
      }
      is_board_owner: {
        Args: { p_board_id: string; p_uid?: string }
        Returns: boolean
      }
      is_case_frozen: { Args: { p_case_id: string }; Returns: boolean }
      is_case_watcher: {
        Args: { p_case_id: string; p_uid?: string }
        Returns: boolean
      }
      is_dept_lead: {
        Args: { p_dept_id: string; p_uid?: string }
        Returns: boolean
      }
      is_direct_report: {
        Args: { manager_uid: string; target_uid: string }
        Returns: boolean
      }
      is_portal_customer: { Args: { uid?: string }; Returns: boolean }
      is_private_inbox_dept: { Args: { p_dept_id: string }; Returns: boolean }
      is_project_member: {
        Args: { p_project_id: string; uid?: string }
        Returns: boolean
      }
      mark_ai_messages_read: { Args: { p_vorgang_id: string }; Returns: number }
      next_counter: { Args: { p_key: string }; Returns: number }
      policy_category: { Args: { p_policy_id: string }; Returns: string }
      purge_old_trashed_boards: { Args: never; Returns: undefined }
      purge_old_trashed_notes: { Args: never; Returns: undefined }
      purge_trashed_cases: { Args: never; Returns: number }
      recalc_case_effective_urgency: {
        Args: { _case_id: string }
        Returns: undefined
      }
      recompute_case_urgency: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      recompute_project_urgency: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      restore_deleted_case: { Args: { p_deleted_id: string }; Returns: string }
      user_department: { Args: { uid?: string }; Returns: string }
      user_id_by_email: { Args: { p_email: string }; Returns: string }
    }
    Enums: {
      announcement_severity: "info" | "wichtig" | "kritisch"
      app_role: "admin" | "staff" | "viewer"
      case_status:
        | "nicht_begonnen"
        | "in_planung"
        | "in_arbeit"
        | "in_verzug"
        | "abgeschlossen"
        | "ready_for_review"
        | "blocked"
        | "verworfen"
        | "archiv"
      company_type: "kunde" | "distributor" | "mitbewerber"
      crm_activity_type: "call" | "email" | "meeting" | "task" | "note"
      customer_tier: "standard" | "premium" | "distributor"
      deal_stage:
        | "anfrage"
        | "qualifikation"
        | "angebot_versendet"
        | "verhandlung"
        | "won"
        | "lost"
      dept_member_role: "read" | "write" | "lead"
      dept_permission: "none" | "read" | "write"
      document_entity_type: "case" | "project" | "company" | "support_ticket"
      enrollment_status:
        | "aktiv"
        | "pausiert"
        | "abgeschlossen"
        | "abgemeldet"
        | "geantwortet"
      lead_source: "manuell" | "csv" | "linkedin" | "look-a-like"
      lead_status:
        | "neu"
        | "qualifiziert"
        | "eingeschrieben"
        | "konvertiert"
        | "abgelehnt"
      offer_status:
        | "entwurf"
        | "versendet"
        | "angenommen"
        | "abgelehnt"
        | "abgelaufen"
      product_request_status: "ausstehend" | "genehmigt" | "abgelehnt"
      protection_scope: "global" | "department" | "subsidiary"
      protection_status: "aktiv" | "abgelaufen" | "strittig"
      sequence_channel: "email" | "task"
      sequence_enrollment_status: "active" | "paused" | "done"
      sequence_status: "aktiv" | "pausiert"
      sequence_step_type: "email" | "wait" | "task"
      support_ticket_priority: "low" | "medium" | "high" | "critical"
      support_ticket_status:
        | "open"
        | "in_progress"
        | "waiting"
        | "resolved"
        | "closed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_severity: ["info", "wichtig", "kritisch"],
      app_role: ["admin", "staff", "viewer"],
      case_status: [
        "nicht_begonnen",
        "in_planung",
        "in_arbeit",
        "in_verzug",
        "abgeschlossen",
        "ready_for_review",
        "blocked",
        "verworfen",
        "archiv",
      ],
      company_type: ["kunde", "distributor", "mitbewerber"],
      crm_activity_type: ["call", "email", "meeting", "task", "note"],
      customer_tier: ["standard", "premium", "distributor"],
      deal_stage: [
        "anfrage",
        "qualifikation",
        "angebot_versendet",
        "verhandlung",
        "won",
        "lost",
      ],
      dept_member_role: ["read", "write", "lead"],
      dept_permission: ["none", "read", "write"],
      document_entity_type: ["case", "project", "company", "support_ticket"],
      enrollment_status: [
        "aktiv",
        "pausiert",
        "abgeschlossen",
        "abgemeldet",
        "geantwortet",
      ],
      lead_source: ["manuell", "csv", "linkedin", "look-a-like"],
      lead_status: [
        "neu",
        "qualifiziert",
        "eingeschrieben",
        "konvertiert",
        "abgelehnt",
      ],
      offer_status: [
        "entwurf",
        "versendet",
        "angenommen",
        "abgelehnt",
        "abgelaufen",
      ],
      product_request_status: ["ausstehend", "genehmigt", "abgelehnt"],
      protection_scope: ["global", "department", "subsidiary"],
      protection_status: ["aktiv", "abgelaufen", "strittig"],
      sequence_channel: ["email", "task"],
      sequence_enrollment_status: ["active", "paused", "done"],
      sequence_status: ["aktiv", "pausiert"],
      sequence_step_type: ["email", "wait", "task"],
      support_ticket_priority: ["low", "medium", "high", "critical"],
      support_ticket_status: [
        "open",
        "in_progress",
        "waiting",
        "resolved",
        "closed",
      ],
    },
  },
} as const
