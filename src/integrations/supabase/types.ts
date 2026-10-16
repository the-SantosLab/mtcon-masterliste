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
          bewertungspreis_dat: string | null
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
          bewertungspreis_dat?: string | null
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
          bewertungspreis_dat?: string | null
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
      article_stock_locations: {
        Row: {
          aend_dat: string | null
          aend_ind: string | null
          art_nr: string
          behaelter: string
          best_inv: number | null
          bestand: number
          charge_ext: string | null
          charge_nr: string
          created_at: string
          datum_abg: string | null
          datum_inv: string | null
          datum_zu: string | null
          fuellgrad_pct: number | null
          id: string
          lager: string
          lagerpl: string
          mb_menge: number
          me: string | null
          note: string | null
          res_auf_nr: string | null
          res_auf_pos: string | null
          res_wa_nr: string | null
          sb_menge: number
          source: string
          updated_at: string
          updated_by: string | null
          verp_mg: number | null
        }
        Insert: {
          aend_dat?: string | null
          aend_ind?: string | null
          art_nr: string
          behaelter?: string
          best_inv?: number | null
          bestand?: number
          charge_ext?: string | null
          charge_nr?: string
          created_at?: string
          datum_abg?: string | null
          datum_inv?: string | null
          datum_zu?: string | null
          fuellgrad_pct?: number | null
          id?: string
          lager: string
          lagerpl?: string
          mb_menge?: number
          me?: string | null
          note?: string | null
          res_auf_nr?: string | null
          res_auf_pos?: string | null
          res_wa_nr?: string | null
          sb_menge?: number
          source?: string
          updated_at?: string
          updated_by?: string | null
          verp_mg?: number | null
        }
        Update: {
          aend_dat?: string | null
          aend_ind?: string | null
          art_nr?: string
          behaelter?: string
          best_inv?: number | null
          bestand?: number
          charge_ext?: string | null
          charge_nr?: string
          created_at?: string
          datum_abg?: string | null
          datum_inv?: string | null
          datum_zu?: string | null
          fuellgrad_pct?: number | null
          id?: string
          lager?: string
          lagerpl?: string
          mb_menge?: number
          me?: string | null
          note?: string | null
          res_auf_nr?: string | null
          res_auf_pos?: string | null
          res_wa_nr?: string | null
          sb_menge?: number
          source?: string
          updated_at?: string
          updated_by?: string | null
          verp_mg?: number | null
        }
        Relationships: []
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
          ausfuehrung: string | null
          bautyp: string | null
          bezeich_1: string | null
          bezeich_2: string | null
          created_at: string
          dichtring: string | null
          dispo_kz: string | null
          dispo_kz_label: string | null
          eisos_nr: string | null
          erni_nr: string | null
          galvanik: string | null
          ger_lfd_nr: string | null
          gewinde: string | null
          hoehe: string | null
          ics_nr: string | null
          is_blocked: boolean | null
          kennung: string | null
          kennung_label: string | null
          koerper: string | null
          mass_1: string | null
          mat_art: string | null
          matchcode: string | null
          material: string | null
          mb_menge: number | null
          me: string | null
          memo_ext: string | null
          mwst_gr: string | null
          mwst_gr_label: string | null
          nutz_gewinde: string | null
          pe: number | null
          pinlaenge: string | null
          pins: string | null
          rastermass: string | null
          stw_nr: string | null
          t_art: string | null
          updated_at: string
          updated_by: string | null
          verp_mg: number | null
          weber_art_nr: string | null
          weber_bez: string | null
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
          ausfuehrung?: string | null
          bautyp?: string | null
          bezeich_1?: string | null
          bezeich_2?: string | null
          created_at?: string
          dichtring?: string | null
          dispo_kz?: string | null
          dispo_kz_label?: string | null
          eisos_nr?: string | null
          erni_nr?: string | null
          galvanik?: string | null
          ger_lfd_nr?: string | null
          gewinde?: string | null
          hoehe?: string | null
          ics_nr?: string | null
          is_blocked?: boolean | null
          kennung?: string | null
          kennung_label?: string | null
          koerper?: string | null
          mass_1?: string | null
          mat_art?: string | null
          matchcode?: string | null
          material?: string | null
          mb_menge?: number | null
          me?: string | null
          memo_ext?: string | null
          mwst_gr?: string | null
          mwst_gr_label?: string | null
          nutz_gewinde?: string | null
          pe?: number | null
          pinlaenge?: string | null
          pins?: string | null
          rastermass?: string | null
          stw_nr?: string | null
          t_art?: string | null
          updated_at?: string
          updated_by?: string | null
          verp_mg?: number | null
          weber_art_nr?: string | null
          weber_bez?: string | null
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
          ausfuehrung?: string | null
          bautyp?: string | null
          bezeich_1?: string | null
          bezeich_2?: string | null
          created_at?: string
          dichtring?: string | null
          dispo_kz?: string | null
          dispo_kz_label?: string | null
          eisos_nr?: string | null
          erni_nr?: string | null
          galvanik?: string | null
          ger_lfd_nr?: string | null
          gewinde?: string | null
          hoehe?: string | null
          ics_nr?: string | null
          is_blocked?: boolean | null
          kennung?: string | null
          kennung_label?: string | null
          koerper?: string | null
          mass_1?: string | null
          mat_art?: string | null
          matchcode?: string | null
          material?: string | null
          mb_menge?: number | null
          me?: string | null
          memo_ext?: string | null
          mwst_gr?: string | null
          mwst_gr_label?: string | null
          nutz_gewinde?: string | null
          pe?: number | null
          pinlaenge?: string | null
          pins?: string | null
          rastermass?: string | null
          stw_nr?: string | null
          t_art?: string | null
          updated_at?: string
          updated_by?: string | null
          verp_mg?: number | null
          weber_art_nr?: string | null
          weber_bez?: string | null
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
          state: Json | null
          status: string
          storage_path: string
          tables_count: number | null
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          note?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          state?: Json | null
          status?: string
          storage_path: string
          tables_count?: number | null
          trigger: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          note?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          state?: Json | null
          status?: string
          storage_path?: string
          tables_count?: number | null
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      capacity_entries: {
        Row: {
          capacity_hours: number
          created_at: string
          department_id: string | null
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          capacity_hours?: number
          created_at?: string
          department_id?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          capacity_hours?: number
          created_at?: string
          department_id?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_entries_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
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
          raw_eml_path: string | null
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
          raw_eml_path?: string | null
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
          raw_eml_path?: string | null
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
          completed_outputs: Json
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          due_at: string | null
          id: string
          required_outputs: Json
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
          completed_outputs?: Json
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          required_outputs?: Json
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
          completed_outputs?: Json
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          required_outputs?: Json
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
          archived_at: string | null
          archived_by: string | null
          assignee_id: string | null
          case_no: string
          case_number: string | null
          client_name: string | null
          closed_at: string | null
          closed_by: string | null
          closure_outputs: Json
          closure_summary: string | null
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
          planned_week: string | null
          priority_order: number
          process_shape: string | null
          process_template_id: string | null
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
          watcher_departments: string[]
          watchers: string[]
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          assignee_id?: string | null
          case_no?: string
          case_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_outputs?: Json
          closure_summary?: string | null
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
          planned_week?: string | null
          priority_order?: number
          process_shape?: string | null
          process_template_id?: string | null
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
          watcher_departments?: string[]
          watchers?: string[]
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          assignee_id?: string | null
          case_no?: string
          case_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_outputs?: Json
          closure_summary?: string | null
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
          planned_week?: string | null
          priority_order?: number
          process_shape?: string | null
          process_template_id?: string | null
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
          watcher_departments?: string[]
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
            foreignKeyName: "cases_process_template_id_fkey"
            columns: ["process_template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
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
          bank_name: string | null
          bic: string | null
          billing_city: string | null
          billing_country: string | null
          billing_street: string | null
          billing_zip: string | null
          country: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          customer_no: string | null
          default_currency: string | null
          discount_pct: number | null
          email: string | null
          iban: string | null
          id: string
          industry: string | null
          is_active: boolean
          language: string | null
          last_changed_by: string | null
          name: string
          notes: string | null
          owner_id: string | null
          parent_company_id: string | null
          partner_role: Database["public"]["Enums"]["partner_role"]
          payment_terms_days: number | null
          payment_terms_text: string | null
          phone: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_same_as_billing: boolean
          shipping_street: string | null
          shipping_zip: string | null
          supplier_code: string | null
          tax_no: string | null
          type: Database["public"]["Enums"]["company_type"]
          updated_at: string
          vat_id: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_name?: string | null
          bic?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          customer_no?: string | null
          default_currency?: string | null
          discount_pct?: number | null
          email?: string | null
          iban?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          language?: string | null
          last_changed_by?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          parent_company_id?: string | null
          partner_role?: Database["public"]["Enums"]["partner_role"]
          payment_terms_days?: number | null
          payment_terms_text?: string | null
          phone?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_same_as_billing?: boolean
          shipping_street?: string | null
          shipping_zip?: string | null
          supplier_code?: string | null
          tax_no?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
          vat_id?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_name?: string | null
          bic?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_street?: string | null
          billing_zip?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          customer_no?: string | null
          default_currency?: string | null
          discount_pct?: number | null
          email?: string | null
          iban?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          language?: string | null
          last_changed_by?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          parent_company_id?: string | null
          partner_role?: Database["public"]["Enums"]["partner_role"]
          payment_terms_days?: number | null
          payment_terms_text?: string | null
          phone?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_same_as_billing?: boolean
          shipping_street?: string | null
          shipping_zip?: string | null
          supplier_code?: string | null
          tax_no?: string | null
          type?: Database["public"]["Enums"]["company_type"]
          updated_at?: string
          vat_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_locations: {
        Row: {
          city: string | null
          company_id: string
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          location_type: string
          name: string
          notes: string | null
          phone: string | null
          street: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          location_type?: string
          name: string
          notes?: string | null
          phone?: string | null
          street?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          location_type?: string
          name?: string
          notes?: string | null
          phone?: string | null
          street?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          email_opt_in: boolean
          email_opt_in_at: string | null
          email_opt_out_at: string | null
          first_name: string
          id: string
          is_decision_maker: boolean
          last_name: string
          linkedin_url: string | null
          mobile: string | null
          notes: string | null
          phone: string | null
          position: string | null
          salutation: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          email_opt_in?: boolean
          email_opt_in_at?: string | null
          email_opt_out_at?: string | null
          first_name: string
          id?: string
          is_decision_maker?: boolean
          last_name: string
          linkedin_url?: string | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          salutation?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          email_opt_in?: boolean
          email_opt_in_at?: string | null
          email_opt_out_at?: string | null
          first_name?: string
          id?: string
          is_decision_maker?: boolean
          last_name?: string
          linkedin_url?: string | null
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          salutation?: string | null
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
      container_module_blocks: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          module_key: string
          reason: string | null
          user_id: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          module_key: string
          reason?: string | null
          user_id: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          module_key?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
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
          lead_id: string | null
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
          lead_id?: string | null
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
          lead_id?: string | null
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
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automations: {
        Row: {
          action_type: string
          activity_type: Database["public"]["Enums"]["crm_activity_type"] | null
          assignee_id: string | null
          body: string | null
          created_at: string
          created_by: string | null
          due_in_days: number
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          run_count: number
          subject: string
          trigger_event: string
          trigger_stage: Database["public"]["Enums"]["deal_stage"] | null
          updated_at: string
        }
        Insert: {
          action_type: string
          activity_type?:
            | Database["public"]["Enums"]["crm_activity_type"]
            | null
          assignee_id?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          due_in_days?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          run_count?: number
          subject: string
          trigger_event: string
          trigger_stage?: Database["public"]["Enums"]["deal_stage"] | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          activity_type?:
            | Database["public"]["Enums"]["crm_activity_type"]
            | null
          assignee_id?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          due_in_days?: number
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          run_count?: number
          subject?: string
          trigger_event?: string
          trigger_stage?: Database["public"]["Enums"]["deal_stage"] | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_consent_log: {
        Row: {
          action: string
          consent_type: string
          contact_id: string | null
          email: string
          id: string
          ip_address: string | null
          notes: string | null
          occurred_at: string
          source: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          consent_type: string
          contact_id?: string | null
          email: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          occurred_at?: string
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          consent_type?: string
          contact_id?: string | null
          email?: string
          id?: string
          ip_address?: string | null
          notes?: string | null
          occurred_at?: string
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_consent_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
      crm_lead_scoring_rules: {
        Row: {
          created_at: string
          created_by: string | null
          field: string
          id: string
          is_active: boolean
          name: string
          operator: string
          points: number
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field: string
          id?: string
          is_active?: boolean
          name: string
          operator?: string
          points?: number
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field?: string
          id?: string
          is_active?: boolean
          name?: string
          operator?: string
          points?: number
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      crm_sales_goals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metric: string
          notes: string | null
          owner_id: string | null
          period_month: number | null
          period_year: number
          target_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric?: string
          notes?: string | null
          owner_id?: string | null
          period_month?: number | null
          period_year: number
          target_value: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric?: string
          notes?: string | null
          owner_id?: string | null
          period_month?: number | null
          period_year?: number
          target_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_default: boolean
          is_shared: boolean
          name: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_default?: boolean
          is_shared?: boolean
          name?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_stage_probabilities: {
        Row: {
          probability: number
          rotting_days: number | null
          stage: Database["public"]["Enums"]["deal_stage"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          probability: number
          rotting_days?: number | null
          stage: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          probability?: number
          rotting_days?: number | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      crm_tag_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "crm_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          scope: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          scope?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          scope?: string
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
      crm_visit_reports: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          id: string
          location_id: string | null
          next_steps: string | null
          participants: string | null
          purpose: string | null
          result: string | null
          visit_date: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          location_id?: string | null
          next_steps?: string | null
          participants?: string | null
          purpose?: string | null
          result?: string | null
          visit_date?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          id?: string
          location_id?: string | null
          next_steps?: string | null
          participants?: string | null
          purpose?: string | null
          result?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_visit_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visit_reports_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visit_reports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "company_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_web_form_endpoints: {
        Row: {
          allowed_origins: string[] | null
          created_at: string
          created_by: string | null
          default_owner_id: string | null
          default_source: string | null
          description: string | null
          honeypot_field: string | null
          id: string
          is_active: boolean
          name: string
          notify_user_ids: string[] | null
          redirect_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          allowed_origins?: string[] | null
          created_at?: string
          created_by?: string | null
          default_owner_id?: string | null
          default_source?: string | null
          description?: string | null
          honeypot_field?: string | null
          id?: string
          is_active?: boolean
          name: string
          notify_user_ids?: string[] | null
          redirect_url?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          allowed_origins?: string[] | null
          created_at?: string
          created_by?: string | null
          default_owner_id?: string | null
          default_source?: string | null
          description?: string | null
          honeypot_field?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notify_user_ids?: string[] | null
          redirect_url?: string | null
          slug?: string
          updated_at?: string
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
      deal_competitors: {
        Row: {
          competitor_id: string
          created_at: string
          deal_id: string
          id: string
          strengths: string | null
          their_price: number | null
          weaknesses: string | null
        }
        Insert: {
          competitor_id: string
          created_at?: string
          deal_id: string
          id?: string
          strengths?: string | null
          their_price?: number | null
          weaknesses?: string | null
        }
        Update: {
          competitor_id?: string
          created_at?: string
          deal_id?: string
          id?: string
          strengths?: string | null
          their_price?: number | null
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_competitors_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_competitors_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
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
          expected_close_date: string | null
          id: string
          lead_source: Database["public"]["Enums"]["lead_source"] | null
          lost_at: string | null
          lost_details: string | null
          lost_reason_id: string | null
          owner_id: string | null
          primary_contact_id: string | null
          probability_override: number | null
          quantity: number | null
          sop: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at: string
          title: string
          updated_at: string
          value_estimated: number | null
          value_final: number | null
          won_at: string | null
          won_case_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_no?: string
          delivery_address?: string | null
          expected_close_date?: string | null
          id?: string
          lead_source?: Database["public"]["Enums"]["lead_source"] | null
          lost_at?: string | null
          lost_details?: string | null
          lost_reason_id?: string | null
          owner_id?: string | null
          primary_contact_id?: string | null
          probability_override?: number | null
          quantity?: number | null
          sop?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at?: string
          title: string
          updated_at?: string
          value_estimated?: number | null
          value_final?: number | null
          won_at?: string | null
          won_case_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_no?: string
          delivery_address?: string | null
          expected_close_date?: string | null
          id?: string
          lead_source?: Database["public"]["Enums"]["lead_source"] | null
          lost_at?: string | null
          lost_details?: string | null
          lost_reason_id?: string | null
          owner_id?: string | null
          primary_contact_id?: string | null
          probability_override?: number | null
          quantity?: number | null
          sop?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          stage_changed_at?: string
          title?: string
          updated_at?: string
          value_estimated?: number | null
          value_final?: number | null
          won_at?: string | null
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
      deliveries: {
        Row: {
          carrier: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          delivery_date: string | null
          delivery_no: string
          id: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          order_id: string | null
          ship_to: string | null
          status: string
          tracking_no: string | null
          tracking_pushed_at: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          delivery_no?: string
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          order_id?: string | null
          ship_to?: string | null
          status?: string
          tracking_no?: string | null
          tracking_pushed_at?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_date?: string | null
          delivery_no?: string
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          order_id?: string | null
          ship_to?: string | null
          status?: string
          tracking_no?: string | null
          tracking_pushed_at?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          art_nr: string | null
          created_at: string
          delivery_id: string
          description: string
          id: string
          lot_no: string | null
          order_item_id: string | null
          position: number
          quantity: number
          serial_no: string | null
          unit: string | null
          warehouse_id: string | null
        }
        Insert: {
          art_nr?: string | null
          created_at?: string
          delivery_id: string
          description: string
          id?: string
          lot_no?: string | null
          order_item_id?: string | null
          position?: number
          quantity?: number
          serial_no?: string | null
          unit?: string | null
          warehouse_id?: string | null
        }
        Update: {
          art_nr?: string | null
          created_at?: string
          delivery_id?: string
          description?: string
          id?: string
          lot_no?: string | null
          order_item_id?: string | null
          position?: number
          quantity?: number
          serial_no?: string | null
          unit?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
      dept_folder_templates: {
        Row: {
          bucket: string
          department_id: string
          folders: string[]
          updated_at: string
        }
        Insert: {
          bucket?: string
          department_id: string
          folders?: string[]
          updated_at?: string
        }
        Update: {
          bucket?: string
          department_id?: string
          folders?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dept_folder_templates_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
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
      drawing_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "drawing_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_files: {
        Row: {
          drawing_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          drawing_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          drawing_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_files_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_parameters: {
        Row: {
          created_at: string
          drawing_id: string
          id: string
          name: string
          sort_order: number
          value: string | null
        }
        Insert: {
          created_at?: string
          drawing_id: string
          id?: string
          name: string
          sort_order?: number
          value?: string | null
        }
        Update: {
          created_at?: string
          drawing_id?: string
          id?: string
          name?: string
          sort_order?: number
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_parameters_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_set_items: {
        Row: {
          created_at: string
          drawing_id: string
          id: string
          pinned_version: number | null
          quantity: number
          set_id: string
        }
        Insert: {
          created_at?: string
          drawing_id: string
          id?: string
          pinned_version?: number | null
          quantity?: number
          set_id: string
        }
        Update: {
          created_at?: string
          drawing_id?: string
          id?: string
          pinned_version?: number | null
          quantity?: number
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_set_items_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_set_items_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "drawing_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_sets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          set_no: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          set_no: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          set_no?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      drawing_versions: {
        Row: {
          change_note: string | null
          drawing_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          status: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          change_note?: string | null
          drawing_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          version: number
        }
        Update: {
          change_note?: string | null
          drawing_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "drawing_versions_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawings"
            referencedColumns: ["id"]
          },
        ]
      }
      drawings: {
        Row: {
          article_art_nr: string | null
          case_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          current_version: number
          current_version_id: string | null
          drawing_no: string
          id: string
          manufacturer: string | null
          note: string | null
          part_name: string | null
          price: number | null
          price_note: string | null
          project_id: string | null
          subcategory_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          article_art_nr?: string | null
          case_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          current_version_id?: string | null
          drawing_no: string
          id?: string
          manufacturer?: string | null
          note?: string | null
          part_name?: string | null
          price?: number | null
          price_note?: string | null
          project_id?: string | null
          subcategory_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          article_art_nr?: string | null
          case_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          current_version_id?: string | null
          drawing_no?: string
          id?: string
          manufacturer?: string | null
          note?: string | null
          part_name?: string | null
          price?: number | null
          price_note?: string | null
          project_id?: string | null
          subcategory_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "drawing_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawings_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "drawing_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_settings: {
        Row: {
          bcc_email: string | null
          enabled: boolean
          id: boolean
          sender_email: string
          sender_name: string
          stage1_days: number
          stage1_fee: number
          stage2_days: number
          stage2_fee: number
          stage3_days: number
          stage3_fee: number
          updated_at: string
        }
        Insert: {
          bcc_email?: string | null
          enabled?: boolean
          id?: boolean
          sender_email?: string
          sender_name?: string
          stage1_days?: number
          stage1_fee?: number
          stage2_days?: number
          stage2_fee?: number
          stage3_days?: number
          stage3_fee?: number
          updated_at?: string
        }
        Update: {
          bcc_email?: string | null
          enabled?: boolean
          id?: boolean
          sender_email?: string
          sender_name?: string
          stage1_days?: number
          stage1_fee?: number
          stage2_days?: number
          stage2_fee?: number
          stage3_days?: number
          stage3_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
      erp_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          is_active: boolean
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      erp_activity: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string
          entity_no: string | null
          entity_type: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id: string
          entity_no?: string | null
          entity_type: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string
          entity_no?: string | null
          entity_type?: string
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      erp_pdf_templates: {
        Row: {
          created_at: string
          doc_type: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          doc_type: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          doc_type?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: []
      }
      erp_template_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          doc_type: string
          id: string
          scope: string
          scope_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_type: string
          id?: string
          scope: string
          scope_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_type?: string
          id?: string
          scope?: string
          scope_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_template_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "erp_pdf_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          currency: string
          id: string
          rate_to_eur: number
          valid_from: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          rate_to_eur: number
          valid_from: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          rate_to_eur?: number
          valid_from?: string
        }
        Relationships: []
      }
      ghv_agreements: {
        Row: {
          category_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
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
          customer_id?: string | null
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
          customer_id?: string | null
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
            foreignKeyName: "ghv_agreements_category_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ghv_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ghv_categories: {
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
        Relationships: []
      }
      ghv_documents: {
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
            foreignKeyName: "ghv_documents_agreement_fk"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "ghv_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          created_at: string
          expiry_date: string | null
          gr_id: string
          id: string
          lot_id: string | null
          lot_no: string | null
          lot_no_ext: string | null
          movement_id: string | null
          po_item_id: string
          qty_received: number
          storage_location_id: string | null
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          gr_id: string
          id?: string
          lot_id?: string | null
          lot_no?: string | null
          lot_no_ext?: string | null
          movement_id?: string | null
          po_item_id: string
          qty_received: number
          storage_location_id?: string | null
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          gr_id?: string
          id?: string
          lot_id?: string | null
          lot_no?: string | null
          lot_no_ext?: string | null
          movement_id?: string | null
          po_item_id?: string
          qty_received?: number
          storage_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_gr_id_fkey"
            columns: ["gr_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          delivery_note_no: string | null
          gr_no: string | null
          id: string
          notes: string | null
          po_id: string
          received_at: string
          received_by: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_note_no?: string | null
          gr_no?: string | null
          id?: string
          notes?: string | null
          po_id: string
          received_at?: string
          received_by?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_note_no?: string | null
          gr_no?: string | null
          id?: string
          notes?: string | null
          po_id?: string
          received_at?: string
          received_by?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
          customer_id: string | null
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
          customer_id?: string | null
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
          customer_id?: string | null
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
          {
            foreignKeyName: "insurance_policies_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      inventory_stock: {
        Row: {
          art_nr: string
          created_at: string
          id: string
          min_quantity: number
          quantity: number
          reorder_quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          art_nr: string
          created_at?: string
          id?: string
          min_quantity?: number
          quantity?: number
          reorder_quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          art_nr?: string
          created_at?: string
          id?: string
          min_quantity?: number
          quantity?: number
          reorder_quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
          {
            foreignKeyName: "inventory_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          art_nr: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number | null
          order_item_id: string | null
          position: number
          quantity: number
          tax_rate: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          art_nr?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number | null
          order_item_id?: string | null
          position?: number
          quantity?: number
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          art_nr?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number | null
          order_item_id?: string | null
          position?: number
          quantity?: number
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          method: string | null
          note: string | null
          paid_on: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          method?: string | null
          note?: string | null
          paid_on?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          method?: string | null
          note?: string | null
          paid_on?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          created_at: string
          created_by: string | null
          fee: number
          id: string
          invoice_id: string
          note: string | null
          sent_at: string
          sent_to: string | null
          stage: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fee?: number
          id?: string
          invoice_id: string
          note?: string | null
          sent_at?: string
          sent_to?: string | null
          stage: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fee?: number
          id?: string
          invoice_id?: string
          note?: string | null
          sent_at?: string
          sent_to?: string | null
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_address: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_of_invoice_id: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_no: string | null
          delivery_id: string | null
          doc_kind: string
          due_date: string | null
          dunning_fee_total: number
          id: string
          invoice_date: string | null
          invoice_no: string
          invoice_type: string
          last_reminder_at: string | null
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          order_id: string | null
          paid_amount: number
          paid_at: string | null
          payment_status: string
          payment_terms: string | null
          payment_terms_days: number
          reminder_stage: number
          skonto_days: number | null
          skonto_percent: number | null
          status: string
          storno_of_invoice_id: string | null
          subtotal_amount: number | null
          tax_amount: number | null
          tax_mode: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_of_invoice_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_no?: string | null
          delivery_id?: string | null
          doc_kind?: string
          due_date?: string | null
          dunning_fee_total?: number
          id?: string
          invoice_date?: string | null
          invoice_no?: string
          invoice_type?: string
          last_reminder_at?: string | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_status?: string
          payment_terms?: string | null
          payment_terms_days?: number
          reminder_stage?: number
          skonto_days?: number | null
          skonto_percent?: number | null
          status?: string
          storno_of_invoice_id?: string | null
          subtotal_amount?: number | null
          tax_amount?: number | null
          tax_mode?: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_of_invoice_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_no?: string | null
          delivery_id?: string | null
          doc_kind?: string
          due_date?: string | null
          dunning_fee_total?: number
          id?: string
          invoice_date?: string | null
          invoice_no?: string
          invoice_type?: string
          last_reminder_at?: string | null
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          paid_at?: string | null
          payment_status?: string
          payment_terms?: string | null
          payment_terms_days?: number
          reminder_stage?: number
          skonto_days?: number | null
          skonto_percent?: number | null
          status?: string
          storno_of_invoice_id?: string | null
          subtotal_amount?: number | null
          tax_amount?: number | null
          tax_mode?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_credit_note_of_invoice_id_fkey"
            columns: ["credit_note_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_storno_of_invoice_id_fkey"
            columns: ["storno_of_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_deliveries: {
        Row: {
          auf_nr_la: number | null
          brutto_gew: number | null
          buch_kz: number | null
          buch_text: string | null
          company_id: string | null
          created_at: string
          druck_dat: string | null
          druck_kz: number | null
          druck_text: string | null
          id: string
          kd_nr: string | null
          kz_erl: boolean | null
          kz_kons_ab: boolean | null
          kz_konsi: boolean | null
          land: string | null
          lb: string | null
          lieferadr: number | null
          ls_datum: string | null
          ls_nr: number
          matchcode: string | null
          name1: string | null
          netto_gew: number | null
          ort: string | null
          packstuecke: number | null
          pers_nr: string | null
          plz: string | null
          sprache: string | null
          sprache_text: string | null
          strasse: string | null
          updated_at: string
          va: string | null
          vp: string | null
        }
        Insert: {
          auf_nr_la?: number | null
          brutto_gew?: number | null
          buch_kz?: number | null
          buch_text?: string | null
          company_id?: string | null
          created_at?: string
          druck_dat?: string | null
          druck_kz?: number | null
          druck_text?: string | null
          id?: string
          kd_nr?: string | null
          kz_erl?: boolean | null
          kz_kons_ab?: boolean | null
          kz_konsi?: boolean | null
          land?: string | null
          lb?: string | null
          lieferadr?: number | null
          ls_datum?: string | null
          ls_nr: number
          matchcode?: string | null
          name1?: string | null
          netto_gew?: number | null
          ort?: string | null
          packstuecke?: number | null
          pers_nr?: string | null
          plz?: string | null
          sprache?: string | null
          sprache_text?: string | null
          strasse?: string | null
          updated_at?: string
          va?: string | null
          vp?: string | null
        }
        Update: {
          auf_nr_la?: number | null
          brutto_gew?: number | null
          buch_kz?: number | null
          buch_text?: string | null
          company_id?: string | null
          created_at?: string
          druck_dat?: string | null
          druck_kz?: number | null
          druck_text?: string | null
          id?: string
          kd_nr?: string | null
          kz_erl?: boolean | null
          kz_kons_ab?: boolean | null
          kz_konsi?: boolean | null
          land?: string | null
          lb?: string | null
          lieferadr?: number | null
          ls_datum?: string | null
          ls_nr?: number
          matchcode?: string | null
          name1?: string | null
          netto_gew?: number | null
          ort?: string | null
          packstuecke?: number | null
          pers_nr?: string | null
          plz?: string | null
          sprache?: string | null
          sprache_text?: string | null
          strasse?: string | null
          updated_at?: string
          va?: string | null
          vp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      issos_import_runs: {
        Row: {
          created_at: string
          error_log: Json | null
          file_kind: string
          file_name: string
          id: string
          ran_by: string | null
          rows_error: number
          rows_inserted: number
          rows_total: number
          rows_unmatched: number
          rows_updated: number
        }
        Insert: {
          created_at?: string
          error_log?: Json | null
          file_kind: string
          file_name: string
          id?: string
          ran_by?: string | null
          rows_error?: number
          rows_inserted?: number
          rows_total?: number
          rows_unmatched?: number
          rows_updated?: number
        }
        Update: {
          created_at?: string
          error_log?: Json | null
          file_kind?: string
          file_name?: string
          id?: string
          ran_by?: string | null
          rows_error?: number
          rows_inserted?: number
          rows_total?: number
          rows_unmatched?: number
          rows_updated?: number
        }
        Relationships: []
      }
      issos_invoice_extras: {
        Row: {
          bew_zusatzkosten: number | null
          bezeich: string | null
          bruttow_fw: number | null
          bruttow_gw: number | null
          created_at: string
          erloeskto: string | null
          id: string
          invoice_id: string | null
          kosten: number | null
          kosten2: number | null
          kostenherk: string | null
          kst: string | null
          kst_text: string | null
          ktr: string | null
          ktr_text: string | null
          land: string | null
          ls_datum: string | null
          ls_nr: number | null
          marge: number | null
          marge_e: number | null
          marge_v: number | null
          matchcode: string | null
          menge: number | null
          mwst_gr: string | null
          mwst_gr_text: string | null
          mwst_kto: string | null
          mwst_satz: number | null
          mwst1_fw: number | null
          mwst1_gw: number | null
          mwst2_fw: number | null
          mwst2_gw: number | null
          nettow_fw: number | null
          nettow_gw: number | null
          nummer: number | null
          r_kd_nr: string | null
          rech_folge: number | null
          rech_nr: number
          text_note: string | null
          waehrung: string | null
          zusatzpos: string | null
        }
        Insert: {
          bew_zusatzkosten?: number | null
          bezeich?: string | null
          bruttow_fw?: number | null
          bruttow_gw?: number | null
          created_at?: string
          erloeskto?: string | null
          id?: string
          invoice_id?: string | null
          kosten?: number | null
          kosten2?: number | null
          kostenherk?: string | null
          kst?: string | null
          kst_text?: string | null
          ktr?: string | null
          ktr_text?: string | null
          land?: string | null
          ls_datum?: string | null
          ls_nr?: number | null
          marge?: number | null
          marge_e?: number | null
          marge_v?: number | null
          matchcode?: string | null
          menge?: number | null
          mwst_gr?: string | null
          mwst_gr_text?: string | null
          mwst_kto?: string | null
          mwst_satz?: number | null
          mwst1_fw?: number | null
          mwst1_gw?: number | null
          mwst2_fw?: number | null
          mwst2_gw?: number | null
          nettow_fw?: number | null
          nettow_gw?: number | null
          nummer?: number | null
          r_kd_nr?: string | null
          rech_folge?: number | null
          rech_nr: number
          text_note?: string | null
          waehrung?: string | null
          zusatzpos?: string | null
        }
        Update: {
          bew_zusatzkosten?: number | null
          bezeich?: string | null
          bruttow_fw?: number | null
          bruttow_gw?: number | null
          created_at?: string
          erloeskto?: string | null
          id?: string
          invoice_id?: string | null
          kosten?: number | null
          kosten2?: number | null
          kostenherk?: string | null
          kst?: string | null
          kst_text?: string | null
          ktr?: string | null
          ktr_text?: string | null
          land?: string | null
          ls_datum?: string | null
          ls_nr?: number | null
          marge?: number | null
          marge_e?: number | null
          marge_v?: number | null
          matchcode?: string | null
          menge?: number | null
          mwst_gr?: string | null
          mwst_gr_text?: string | null
          mwst_kto?: string | null
          mwst_satz?: number | null
          mwst1_fw?: number | null
          mwst1_gw?: number | null
          mwst2_fw?: number | null
          mwst2_gw?: number | null
          nettow_fw?: number | null
          nettow_gw?: number | null
          nummer?: number | null
          r_kd_nr?: string | null
          rech_folge?: number | null
          rech_nr?: number
          text_note?: string | null
          waehrung?: string | null
          zusatzpos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_invoice_extras_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "issos_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_invoice_positions: {
        Row: {
          art_kunde: string | null
          art_nr: string | null
          auf_nr: number | null
          aufpos: number | null
          bes_dat1: string | null
          bewertungspreis: number | null
          bezeich1: string | null
          created_at: string
          erloeskto: string | null
          folge: number | null
          id: string
          invoice_id: string | null
          kosten: number | null
          kosten2: number | null
          kostenherk: string | null
          kz_preis: string | null
          land: string | null
          ls_nr: number | null
          marge: number | null
          marge_e: number | null
          marge_v: number | null
          matchcode: string | null
          menge: number | null
          mwst_satz: number | null
          mwst1_fw: number | null
          netto_fw: number | null
          nummer: number | null
          preis_fw: number | null
          preis1_fw: number | null
          r_kd_nr: string | null
          rabatt_pos: number | null
          rech_folge: number | null
          rech_nr: number
          vertr_nr: string | null
          waehrung: string | null
          wert1_fw: number | null
          wert2_fw: number | null
          zu_bezeich: string | null
          zu_pos: string | null
        }
        Insert: {
          art_kunde?: string | null
          art_nr?: string | null
          auf_nr?: number | null
          aufpos?: number | null
          bes_dat1?: string | null
          bewertungspreis?: number | null
          bezeich1?: string | null
          created_at?: string
          erloeskto?: string | null
          folge?: number | null
          id?: string
          invoice_id?: string | null
          kosten?: number | null
          kosten2?: number | null
          kostenherk?: string | null
          kz_preis?: string | null
          land?: string | null
          ls_nr?: number | null
          marge?: number | null
          marge_e?: number | null
          marge_v?: number | null
          matchcode?: string | null
          menge?: number | null
          mwst_satz?: number | null
          mwst1_fw?: number | null
          netto_fw?: number | null
          nummer?: number | null
          preis_fw?: number | null
          preis1_fw?: number | null
          r_kd_nr?: string | null
          rabatt_pos?: number | null
          rech_folge?: number | null
          rech_nr: number
          vertr_nr?: string | null
          waehrung?: string | null
          wert1_fw?: number | null
          wert2_fw?: number | null
          zu_bezeich?: string | null
          zu_pos?: string | null
        }
        Update: {
          art_kunde?: string | null
          art_nr?: string | null
          auf_nr?: number | null
          aufpos?: number | null
          bes_dat1?: string | null
          bewertungspreis?: number | null
          bezeich1?: string | null
          created_at?: string
          erloeskto?: string | null
          folge?: number | null
          id?: string
          invoice_id?: string | null
          kosten?: number | null
          kosten2?: number | null
          kostenherk?: string | null
          kz_preis?: string | null
          land?: string | null
          ls_nr?: number | null
          marge?: number | null
          marge_e?: number | null
          marge_v?: number | null
          matchcode?: string | null
          menge?: number | null
          mwst_satz?: number | null
          mwst1_fw?: number | null
          netto_fw?: number | null
          nummer?: number | null
          preis_fw?: number | null
          preis1_fw?: number | null
          r_kd_nr?: string | null
          rabatt_pos?: number | null
          rech_folge?: number | null
          rech_nr?: number
          vertr_nr?: string | null
          waehrung?: string | null
          wert1_fw?: number | null
          wert2_fw?: number | null
          zu_bezeich?: string | null
          zu_pos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_invoice_positions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "issos_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_invoices: {
        Row: {
          ausloeser: string | null
          belegart: string | null
          belegart_text: string | null
          brutto_fw: number | null
          company_id: string | null
          created_at: string
          datum_net: string | null
          druck_dat: string | null
          druck_kz: number | null
          druck_text: string | null
          fibu_dat: string | null
          iae_kz: string | null
          iae_text: string | null
          id: string
          kz_erl: boolean | null
          kz_sammel: number | null
          matchcode: string | null
          mis_datum: string | null
          mwst1_fw: number | null
          mwst2_fw: number | null
          netto_fw: number | null
          nummer: number | null
          pers_nr: number | null
          r_kd_nr: string | null
          rech_dat: string | null
          rech_nr: number
          sammel_text: string | null
          skonto1: number | null
          skonto2: number | null
          storno_kz: boolean | null
          updated_at: string
          ust_id: string | null
          waehrung: string | null
          zb: number | null
          ziel1: string | null
          ziel2: string | null
        }
        Insert: {
          ausloeser?: string | null
          belegart?: string | null
          belegart_text?: string | null
          brutto_fw?: number | null
          company_id?: string | null
          created_at?: string
          datum_net?: string | null
          druck_dat?: string | null
          druck_kz?: number | null
          druck_text?: string | null
          fibu_dat?: string | null
          iae_kz?: string | null
          iae_text?: string | null
          id?: string
          kz_erl?: boolean | null
          kz_sammel?: number | null
          matchcode?: string | null
          mis_datum?: string | null
          mwst1_fw?: number | null
          mwst2_fw?: number | null
          netto_fw?: number | null
          nummer?: number | null
          pers_nr?: number | null
          r_kd_nr?: string | null
          rech_dat?: string | null
          rech_nr: number
          sammel_text?: string | null
          skonto1?: number | null
          skonto2?: number | null
          storno_kz?: boolean | null
          updated_at?: string
          ust_id?: string | null
          waehrung?: string | null
          zb?: number | null
          ziel1?: string | null
          ziel2?: string | null
        }
        Update: {
          ausloeser?: string | null
          belegart?: string | null
          belegart_text?: string | null
          brutto_fw?: number | null
          company_id?: string | null
          created_at?: string
          datum_net?: string | null
          druck_dat?: string | null
          druck_kz?: number | null
          druck_text?: string | null
          fibu_dat?: string | null
          iae_kz?: string | null
          iae_text?: string | null
          id?: string
          kz_erl?: boolean | null
          kz_sammel?: number | null
          matchcode?: string | null
          mis_datum?: string | null
          mwst1_fw?: number | null
          mwst2_fw?: number | null
          netto_fw?: number | null
          nummer?: number | null
          pers_nr?: number | null
          r_kd_nr?: string | null
          rech_dat?: string | null
          rech_nr?: number
          sammel_text?: string | null
          skonto1?: number | null
          skonto2?: number | null
          storno_kz?: boolean | null
          updated_at?: string
          ust_id?: string | null
          waehrung?: string | null
          zb?: number | null
          ziel1?: string | null
          ziel2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_offer_positions: {
        Row: {
          a_status: string | null
          a_status_text: string | null
          ang_datum: string | null
          ang_menge: number | null
          ang_nr: number
          ang_pos: number | null
          art_kunde: string | null
          art_matchcode: string | null
          art_nr: string | null
          bewertungspreis: number | null
          bezeich_1: string | null
          company_id: string | null
          created_at: string
          id: string
          int_nr: string | null
          kd_nr: string | null
          kosten: number | null
          kosten_1: number | null
          kostenherk: string | null
          kurs: number | null
          kz_preis: boolean | null
          marge: number | null
          marge_e: number | null
          marge_v: number | null
          mat_art: string | null
          mat_art_text: string | null
          matchcode: string | null
          matchcode_1: string | null
          me: string | null
          netto_gw: number | null
          pe: number | null
          preis_fw: number | null
          rabatt_pos: number | null
          waehrung: string | null
        }
        Insert: {
          a_status?: string | null
          a_status_text?: string | null
          ang_datum?: string | null
          ang_menge?: number | null
          ang_nr: number
          ang_pos?: number | null
          art_kunde?: string | null
          art_matchcode?: string | null
          art_nr?: string | null
          bewertungspreis?: number | null
          bezeich_1?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          int_nr?: string | null
          kd_nr?: string | null
          kosten?: number | null
          kosten_1?: number | null
          kostenherk?: string | null
          kurs?: number | null
          kz_preis?: boolean | null
          marge?: number | null
          marge_e?: number | null
          marge_v?: number | null
          mat_art?: string | null
          mat_art_text?: string | null
          matchcode?: string | null
          matchcode_1?: string | null
          me?: string | null
          netto_gw?: number | null
          pe?: number | null
          preis_fw?: number | null
          rabatt_pos?: number | null
          waehrung?: string | null
        }
        Update: {
          a_status?: string | null
          a_status_text?: string | null
          ang_datum?: string | null
          ang_menge?: number | null
          ang_nr?: number
          ang_pos?: number | null
          art_kunde?: string | null
          art_matchcode?: string | null
          art_nr?: string | null
          bewertungspreis?: number | null
          bezeich_1?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          int_nr?: string | null
          kd_nr?: string | null
          kosten?: number | null
          kosten_1?: number | null
          kostenherk?: string | null
          kurs?: number | null
          kz_preis?: boolean | null
          marge?: number | null
          marge_e?: number | null
          marge_v?: number | null
          mat_art?: string | null
          mat_art_text?: string | null
          matchcode?: string | null
          matchcode_1?: string | null
          me?: string | null
          netto_gw?: number | null
          pe?: number | null
          preis_fw?: number | null
          rabatt_pos?: number | null
          waehrung?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_offer_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_offers: {
        Row: {
          ang_nr: number
          ang_stat: string | null
          ang_stat_text: string | null
          betreff1: string | null
          betreff2: string | null
          company_id: string | null
          created_at: string
          druck_dat: string | null
          druck_kz: string | null
          druck_kz_text: string | null
          fristdat: string | null
          id: string
          int_nr: string | null
          kd_nr: string | null
          mandant: string | null
          matchcode: string | null
          pers_nr: string | null
          projekt_nr: string | null
          rabatt: number | null
          updated_at: string
          vertr_nr: string | null
          vorl_datum: string | null
        }
        Insert: {
          ang_nr: number
          ang_stat?: string | null
          ang_stat_text?: string | null
          betreff1?: string | null
          betreff2?: string | null
          company_id?: string | null
          created_at?: string
          druck_dat?: string | null
          druck_kz?: string | null
          druck_kz_text?: string | null
          fristdat?: string | null
          id?: string
          int_nr?: string | null
          kd_nr?: string | null
          mandant?: string | null
          matchcode?: string | null
          pers_nr?: string | null
          projekt_nr?: string | null
          rabatt?: number | null
          updated_at?: string
          vertr_nr?: string | null
          vorl_datum?: string | null
        }
        Update: {
          ang_nr?: number
          ang_stat?: string | null
          ang_stat_text?: string | null
          betreff1?: string | null
          betreff2?: string | null
          company_id?: string | null
          created_at?: string
          druck_dat?: string | null
          druck_kz?: string | null
          druck_kz_text?: string | null
          fristdat?: string | null
          id?: string
          int_nr?: string | null
          kd_nr?: string | null
          mandant?: string | null
          matchcode?: string | null
          pers_nr?: string | null
          projekt_nr?: string | null
          rabatt?: number | null
          updated_at?: string
          vertr_nr?: string | null
          vorl_datum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_order_positions: {
        Row: {
          art_kunde: string | null
          art_nr: string | null
          auf_menge: number | null
          auf_nr: number
          aufpos: number | null
          besnr_kd: string | null
          company_id: string | null
          created_at: string
          erl_dat: string | null
          gel_menge: number | null
          id: string
          kd_nr: string | null
          kz_erl_p: boolean | null
          mat_art: string | null
          mat_art_text: string | null
          preis_fw: number | null
          termin: string | null
        }
        Insert: {
          art_kunde?: string | null
          art_nr?: string | null
          auf_menge?: number | null
          auf_nr: number
          aufpos?: number | null
          besnr_kd?: string | null
          company_id?: string | null
          created_at?: string
          erl_dat?: string | null
          gel_menge?: number | null
          id?: string
          kd_nr?: string | null
          kz_erl_p?: boolean | null
          mat_art?: string | null
          mat_art_text?: string | null
          preis_fw?: number | null
          termin?: string | null
        }
        Update: {
          art_kunde?: string | null
          art_nr?: string | null
          auf_menge?: number | null
          auf_nr?: number
          aufpos?: number | null
          besnr_kd?: string | null
          company_id?: string | null
          created_at?: string
          erl_dat?: string | null
          gel_menge?: number | null
          id?: string
          kd_nr?: string | null
          kz_erl_p?: boolean | null
          mat_art?: string | null
          mat_art_text?: string | null
          preis_fw?: number | null
          termin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_order_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      issos_orders: {
        Row: {
          ang_nr: string | null
          auf_nr: number
          bes_dat_1: string | null
          bes_dat_2: string | null
          company_id: string | null
          created_at: string
          druck_kz: string | null
          druck_text: string | null
          id: string
          kd_nr: string | null
          kz_preis: boolean | null
          lb: string | null
          lief_kunde: string | null
          matchcode: string | null
          pers_nr: string | null
          rabatt: number | null
          updated_at: string
          vertr_nr: string | null
          zb: string | null
        }
        Insert: {
          ang_nr?: string | null
          auf_nr: number
          bes_dat_1?: string | null
          bes_dat_2?: string | null
          company_id?: string | null
          created_at?: string
          druck_kz?: string | null
          druck_text?: string | null
          id?: string
          kd_nr?: string | null
          kz_preis?: boolean | null
          lb?: string | null
          lief_kunde?: string | null
          matchcode?: string | null
          pers_nr?: string | null
          rabatt?: number | null
          updated_at?: string
          vertr_nr?: string | null
          zb?: string | null
        }
        Update: {
          ang_nr?: string | null
          auf_nr?: number
          bes_dat_1?: string | null
          bes_dat_2?: string | null
          company_id?: string | null
          created_at?: string
          druck_kz?: string | null
          druck_text?: string | null
          id?: string
          kd_nr?: string | null
          kz_preis?: boolean | null
          lb?: string | null
          lief_kunde?: string | null
          matchcode?: string | null
          pers_nr?: string | null
          rabatt?: number | null
          updated_at?: string
          vertr_nr?: string | null
          zb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issos_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_rotting_config: {
        Row: {
          rotting_days: number
          stage: string
          updated_at: string
        }
        Insert: {
          rotting_days: number
          stage: string
          updated_at?: string
        }
        Update: {
          rotting_days?: number
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
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
          partner_company_id: string | null
          phone: string | null
          protected_project: string | null
          protected_until: string | null
          rejection_reason: string | null
          routed_by_rule_id: string | null
          score: number
          score_calculated_at: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          status_changed_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
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
          partner_company_id?: string | null
          phone?: string | null
          protected_project?: string | null
          protected_until?: string | null
          rejection_reason?: string | null
          routed_by_rule_id?: string | null
          score?: number
          score_calculated_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          status_changed_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
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
          partner_company_id?: string | null
          phone?: string | null
          protected_project?: string | null
          protected_until?: string | null
          rejection_reason?: string | null
          routed_by_rule_id?: string | null
          score?: number
          score_calculated_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          status_changed_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_partner_company_id_fkey"
            columns: ["partner_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      lots: {
        Row: {
          art_nr: string
          created_at: string
          current_qty: number
          expiry_date: string | null
          first_received_at: string
          id: string
          last_gr_id: string | null
          last_received_at: string
          lot_no: string
          lot_no_ext: string | null
          note: string | null
          receipt_count: number
          status: string
          supplier_lief_nr: string | null
          supplier_name: string | null
          total_received: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          art_nr: string
          created_at?: string
          current_qty?: number
          expiry_date?: string | null
          first_received_at?: string
          id?: string
          last_gr_id?: string | null
          last_received_at?: string
          lot_no: string
          lot_no_ext?: string | null
          note?: string | null
          receipt_count?: number
          status?: string
          supplier_lief_nr?: string | null
          supplier_name?: string | null
          total_received?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          art_nr?: string
          created_at?: string
          current_qty?: number
          expiry_date?: string | null
          first_received_at?: string
          id?: string
          last_gr_id?: string | null
          last_received_at?: string
          lot_no?: string
          lot_no_ext?: string | null
          note?: string | null
          receipt_count?: number
          status?: string
          supplier_lief_nr?: string | null
          supplier_name?: string | null
          total_received?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lots_last_gr_id_fkey"
            columns: ["last_gr_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
        ]
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
          customer_kind: string | null
          doc_classification: string | null
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
          extracted_fields: Json | null
          id: string
          mtiq_generated_note: string | null
          mtiq_reasoning: string | null
          original_snapshot: Json | null
          possible_duplicate_of: string | null
          process_shape: string | null
          recommended_reason: string | null
          route: string
          route_confirmed_at: string | null
          route_confirmed_by: string | null
          routing_suggestion: string | null
          source_email_body: string | null
          source_email_from: string | null
          source_email_message_id: string | null
          source_email_subject: string | null
          source_kind: string | null
          status: string
          suggested_company_id: string | null
          vorgang_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_match_proposals?: Json
          created_at?: string
          created_by?: string | null
          customer_kind?: string | null
          doc_classification?: string | null
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
          extracted_fields?: Json | null
          id?: string
          mtiq_generated_note?: string | null
          mtiq_reasoning?: string | null
          original_snapshot?: Json | null
          possible_duplicate_of?: string | null
          process_shape?: string | null
          recommended_reason?: string | null
          route?: string
          route_confirmed_at?: string | null
          route_confirmed_by?: string | null
          routing_suggestion?: string | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_subject?: string | null
          source_kind?: string | null
          status?: string
          suggested_company_id?: string | null
          vorgang_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_match_proposals?: Json
          created_at?: string
          created_by?: string | null
          customer_kind?: string | null
          doc_classification?: string | null
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
          extracted_fields?: Json | null
          id?: string
          mtiq_generated_note?: string | null
          mtiq_reasoning?: string | null
          original_snapshot?: Json | null
          possible_duplicate_of?: string | null
          process_shape?: string | null
          recommended_reason?: string | null
          route?: string
          route_confirmed_at?: string | null
          route_confirmed_by?: string | null
          routing_suggestion?: string | null
          source_email_body?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_subject?: string | null
          source_kind?: string | null
          status?: string
          suggested_company_id?: string | null
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
      mtiq_tablets: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          current_step: number
          extracted: Json
          id: string
          kind: string
          source_file_path: string | null
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          extracted?: Json
          id?: string
          kind?: string
          source_file_path?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          extracted?: Json
          id?: string
          kind?: string
          source_file_path?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mtiq_tablets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mtiq_tablets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
      offer_events: {
        Row: {
          actor_email: string | null
          actor_name: string | null
          comment: string | null
          event_type: string
          id: string
          ip_address: string | null
          occurred_at: string
          offer_id: string
          signature_data: Json | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_name?: string | null
          comment?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          offer_id: string
          signature_data?: Json | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_name?: string | null
          comment?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          offer_id?: string
          signature_data?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
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
      offer_share_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          offer_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          offer_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          offer_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_share_tokens_offer_id_fkey"
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
          case_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          delivery_address: string | null
          id: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
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
          case_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          delivery_address?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
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
          case_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          delivery_address?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
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
            foreignKeyName: "offers_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
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
      order_handoff_rules: {
        Row: {
          department_id: string | null
          enabled: boolean
          label: string
          stage: string
          updated_at: string
        }
        Insert: {
          department_id?: string | null
          enabled?: boolean
          label: string
          stage: string
          updated_at?: string
        }
        Update: {
          department_id?: string | null
          enabled?: boolean
          label?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_handoff_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      order_handoffs: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completed_reason: string | null
          created_at: string
          department_id: string | null
          id: string
          order_id: string
          stage: string
          status: string
          title: string
          trigger_event: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completed_reason?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          order_id: string
          stage: string
          status?: string
          title: string
          trigger_event?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completed_reason?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          order_id?: string
          stage?: string
          status?: string
          title?: string
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_handoffs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_handoffs_order_id_fkey"
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
          qty_delivered: number
          qty_invoiced: number
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
          qty_delivered?: number
          qty_invoiced?: number
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
          qty_delivered?: number
          qty_invoiced?: number
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
          case_id: string | null
          company_id: string | null
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
          locked: boolean
          locked_at: string | null
          locked_by: string | null
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
          case_id?: string | null
          company_id?: string | null
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
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
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
          case_id?: string | null
          company_id?: string | null
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
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
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
        Relationships: [
          {
            foreignKeyName: "orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      personio_absences: {
        Row: {
          absence_type: string
          category: string | null
          comment: string | null
          created_at: string
          days_count: number
          end_date: string
          half_day_end: boolean
          half_day_start: boolean
          id: string
          personio_absence_id: string | null
          source: string
          start_date: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          absence_type: string
          category?: string | null
          comment?: string | null
          created_at?: string
          days_count?: number
          end_date: string
          half_day_end?: boolean
          half_day_start?: boolean
          id?: string
          personio_absence_id?: string | null
          source?: string
          start_date: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          absence_type?: string
          category?: string | null
          comment?: string | null
          created_at?: string
          days_count?: number
          end_date?: string
          half_day_end?: boolean
          half_day_start?: boolean
          id?: string
          personio_absence_id?: string | null
          source?: string
          start_date?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personio_absences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      personio_attendances: {
        Row: {
          break_minutes: number
          comment: string | null
          created_at: string
          end_time: string | null
          id: string
          personio_attendance_id: string | null
          source: string
          start_time: string | null
          updated_at: string
          user_id: string
          work_date: string
          worked_minutes: number
        }
        Insert: {
          break_minutes?: number
          comment?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          personio_attendance_id?: string | null
          source?: string
          start_time?: string | null
          updated_at?: string
          user_id: string
          work_date: string
          worked_minutes?: number
        }
        Update: {
          break_minutes?: number
          comment?: string | null
          created_at?: string
          end_time?: string | null
          id?: string
          personio_attendance_id?: string | null
          source?: string
          start_time?: string | null
          updated_at?: string
          user_id?: string
          work_date?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "personio_attendances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      personio_employee_map: {
        Row: {
          created_at: string
          email: string | null
          id: string
          personio_employee_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          personio_employee_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          personio_employee_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personio_employee_map_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      personio_manual_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_kind: string
          id: string
          reason: string | null
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_kind: string
          id?: string
          reason?: string | null
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_kind?: string
          id?: string
          reason?: string | null
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personio_manual_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personio_manual_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
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
      price_change_log: {
        Row: {
          art_nr: string
          change_reason: string | null
          changed_by: string | null
          created_at: string
          effective_date: string | null
          field_name: string
          id: string
          new_value: number | null
          old_value: number | null
        }
        Insert: {
          art_nr: string
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_date?: string | null
          field_name: string
          id?: string
          new_value?: number | null
          old_value?: number | null
        }
        Update: {
          art_nr?: string
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_date?: string | null
          field_name?: string
          id?: string
          new_value?: number | null
          old_value?: number | null
        }
        Relationships: []
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
      process_templates: {
        Row: {
          active: boolean
          created_at: string
          departments: string[]
          description: string | null
          id: string
          name: string
          shape: string
          steps: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          departments?: string[]
          description?: string | null
          id?: string
          name: string
          shape: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          departments?: string[]
          description?: string | null
          id?: string
          name?: string
          shape?: string
          steps?: Json
          updated_at?: string
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
      production_order_items: {
        Row: {
          component_art_nr: string
          created_at: string
          description: string | null
          id: string
          lot_no: string | null
          me: string | null
          pos: string | null
          production_order_id: string
          qty_issued: number
          qty_per_unit: number
          qty_required: number
        }
        Insert: {
          component_art_nr: string
          created_at?: string
          description?: string | null
          id?: string
          lot_no?: string | null
          me?: string | null
          pos?: string | null
          production_order_id: string
          qty_issued?: number
          qty_per_unit?: number
          qty_required?: number
        }
        Update: {
          component_art_nr?: string
          created_at?: string
          description?: string | null
          id?: string
          lot_no?: string | null
          me?: string | null
          pos?: string | null
          production_order_id?: string
          qty_issued?: number
          qty_per_unit?: number
          qty_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          art_nr: string
          case_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          issued_at: string | null
          lot_no: string | null
          note: string | null
          order_id: string | null
          planned_end: string | null
          planned_start: string | null
          quantity: number
          quantity_done: number
          status: string
          updated_at: string
          warehouse_id: string
          wo_no: string | null
        }
        Insert: {
          art_nr: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          issued_at?: string | null
          lot_no?: string | null
          note?: string | null
          order_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          quantity?: number
          quantity_done?: number
          status?: string
          updated_at?: string
          warehouse_id: string
          wo_no?: string | null
        }
        Update: {
          art_nr?: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          issued_at?: string | null
          lot_no?: string | null
          note?: string | null
          order_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          quantity?: number
          quantity_done?: number
          status?: string
          updated_at?: string
          warehouse_id?: string
          wo_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
          watchers: string[]
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
          watchers?: string[]
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
          watchers?: string[]
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
      purchase_email_templates: {
        Row: {
          body: string
          email_type: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          email_type: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          email_type?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      purchase_order_email_logs: {
        Row: {
          body: string | null
          email_type: string
          error: string | null
          id: string
          manual: boolean
          po_id: string
          recipient_email: string | null
          recipient_name: string | null
          sent_at: string
          sent_by: string | null
          status: string
          subject: string | null
          trigger_date: string | null
        }
        Insert: {
          body?: string | null
          email_type: string
          error?: string | null
          id?: string
          manual?: boolean
          po_id: string
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status: string
          subject?: string | null
          trigger_date?: string | null
        }
        Update: {
          body?: string | null
          email_type?: string
          error?: string | null
          id?: string
          manual?: boolean
          po_id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          subject?: string | null
          trigger_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_email_logs_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          art_nr: string
          created_at: string
          description: string | null
          id: string
          po_id: string
          position: number
          qty_ordered: number
          qty_received: number
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          art_nr: string
          created_at?: string
          description?: string | null
          id?: string
          po_id: string
          position?: number
          qty_ordered: number
          qty_received?: number
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          art_nr?: string
          created_at?: string
          description?: string | null
          id?: string
          po_id?: string
          position?: number
          qty_ordered?: number
          qty_received?: number
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          case_id: string | null
          clarification_reason: string | null
          company_id: string | null
          confirmation_received_at: string | null
          confirmed_delivery_date: string | null
          created_at: string
          created_by: string | null
          customer_notified_at: string | null
          delay_flagged_at: string | null
          delay_notified_at: string | null
          expected_at: string | null
          id: string
          locked: boolean
          locked_at: string | null
          locked_by: string | null
          needs_clarification: boolean
          notes: string | null
          ordered_at: string | null
          po_no: string | null
          status: Database["public"]["Enums"]["po_status"]
          status_query_mailed_at: string | null
          supplier_delay_mailed_at: string | null
          supplier_id: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          case_id?: string | null
          clarification_reason?: string | null
          company_id?: string | null
          confirmation_received_at?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          created_by?: string | null
          customer_notified_at?: string | null
          delay_flagged_at?: string | null
          delay_notified_at?: string | null
          expected_at?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          needs_clarification?: boolean
          notes?: string | null
          ordered_at?: string | null
          po_no?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          status_query_mailed_at?: string | null
          supplier_delay_mailed_at?: string | null
          supplier_id: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          case_id?: string | null
          clarification_reason?: string | null
          company_id?: string | null
          confirmation_received_at?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          created_by?: string | null
          customer_notified_at?: string | null
          delay_flagged_at?: string | null
          delay_notified_at?: string | null
          expected_at?: string | null
          id?: string
          locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          needs_clarification?: boolean
          notes?: string | null
          ordered_at?: string | null
          po_no?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          status_query_mailed_at?: string | null
          supplier_delay_mailed_at?: string | null
          supplier_id?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_rating_summary"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      restore_runs: {
        Row: {
          backup_created_at: string | null
          backup_id: string | null
          bytes_restored: number
          created_at: string
          duration_ms: number | null
          error: string | null
          file_checks: Json
          files_failed: number
          files_restored: number
          finished_at: string | null
          id: string
          issues_count: number
          rows_inserted: number
          started_by: string | null
          status: string
          table_checks: Json
        }
        Insert: {
          backup_created_at?: string | null
          backup_id?: string | null
          bytes_restored?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          file_checks?: Json
          files_failed?: number
          files_restored?: number
          finished_at?: string | null
          id?: string
          issues_count?: number
          rows_inserted?: number
          started_by?: string | null
          status?: string
          table_checks?: Json
        }
        Update: {
          backup_created_at?: string | null
          backup_id?: string | null
          bytes_restored?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          file_checks?: Json
          files_failed?: number
          files_restored?: number
          finished_at?: string | null
          id?: string
          issues_count?: number
          rows_inserted?: number
          started_by?: string | null
          status?: string
          table_checks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "restore_runs_backup_id_fkey"
            columns: ["backup_id"]
            isOneToOne: false
            referencedRelation: "backups"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_routing_rules: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_assigned_index: number
          match_country: string | null
          match_industry: string | null
          match_keyword: string | null
          match_source: string | null
          min_score: number
          name: string
          pool_user_ids: string[]
          priority: number
          strategy: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_assigned_index?: number
          match_country?: string | null
          match_industry?: string | null
          match_keyword?: string | null
          match_source?: string | null
          min_score?: number
          name: string
          pool_user_ids?: string[]
          priority?: number
          strategy?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_assigned_index?: number
          match_country?: string | null
          match_industry?: string | null
          match_keyword?: string | null
          match_source?: string | null
          min_score?: number
          name?: string
          pool_user_ids?: string[]
          priority?: number
          strategy?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_price_changes: {
        Row: {
          applied: boolean
          applied_at: string | null
          art_nr: string
          created_at: string
          created_by: string | null
          effective_date: string
          field_name: string
          id: string
          new_value: number
          note: string | null
          updated_at: string
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          art_nr: string
          created_at?: string
          created_by?: string | null
          effective_date: string
          field_name: string
          id?: string
          new_value: number
          note?: string | null
          updated_at?: string
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          art_nr?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          field_name?: string
          id?: string
          new_value?: number
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sequence_enrollments: {
        Row: {
          company_id: string | null
          completed_at: string | null
          contact_id: string
          current_step: number
          current_step_index: number
          id: string
          next_action_at: string | null
          paused_at: string | null
          sequence_id: string
          started_at: string
          status: Database["public"]["Enums"]["sequence_enrollment_status"]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          contact_id: string
          current_step?: number
          current_step_index?: number
          id?: string
          next_action_at?: string | null
          paused_at?: string | null
          sequence_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["sequence_enrollment_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string
          current_step?: number
          current_step_index?: number
          id?: string
          next_action_at?: string | null
          paused_at?: string | null
          sequence_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["sequence_enrollment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      stock_count_items: {
        Row: {
          art_nr: string
          count_id: string
          counted_at: string | null
          counted_by: string | null
          counted_qty: number | null
          expected_qty: number
          id: string
          note: string | null
          posted_delta: number | null
        }
        Insert: {
          art_nr: string
          count_id: string
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          expected_qty?: number
          id?: string
          note?: string | null
          posted_delta?: number | null
        }
        Update: {
          art_nr?: string
          count_id?: string
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number | null
          expected_qty?: number
          id?: string
          note?: string | null
          posted_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
          {
            foreignKeyName: "stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          count_no: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          posted_at: string | null
          posted_by: string | null
          status: string
          warehouse_id: string
        }
        Insert: {
          count_no?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          posted_at?: string | null
          posted_by?: string | null
          status?: string
          warehouse_id: string
        }
        Update: {
          count_no?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          posted_at?: string | null
          posted_by?: string | null
          status?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          art_nr: string
          case_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lot_no: string | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          note: string | null
          order_id: string | null
          project_id: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          serial_no: string | null
          target_warehouse_id: string | null
          transfer_id: string | null
          unit_cost: number | null
          warehouse_id: string
        }
        Insert: {
          art_nr: string
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot_no?: string | null
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          note?: string | null
          order_id?: string | null
          project_id?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          serial_no?: string | null
          target_warehouse_id?: string | null
          transfer_id?: string | null
          unit_cost?: number | null
          warehouse_id: string
        }
        Update: {
          art_nr?: string
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lot_no?: string | null
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          note?: string | null
          order_id?: string | null
          project_id?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          serial_no?: string | null
          target_warehouse_id?: string | null
          transfer_id?: string | null
          unit_cost?: number | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
          {
            foreignKeyName: "stock_movements_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          art_nr: string
          case_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          note: string | null
          order_id: string | null
          project_id: string | null
          quantity: number
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          art_nr: string
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          project_id?: string | null
          quantity: number
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          art_nr?: string
          case_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          project_id?: string | null
          quantity?: number
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          behaelter: string
          capacity: number | null
          code: string | null
          created_at: string
          created_by: string | null
          fifo_required: boolean
          id: string
          is_blocked: boolean
          lager: string
          lagerpl: string
          note: string | null
          type: Database["public"]["Enums"]["storage_location_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          behaelter?: string
          capacity?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          fifo_required?: boolean
          id?: string
          is_blocked?: boolean
          lager: string
          lagerpl?: string
          note?: string | null
          type?: Database["public"]["Enums"]["storage_location_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          behaelter?: string
          capacity?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          fifo_required?: boolean
          id?: string
          is_blocked?: boolean
          lager?: string
          lagerpl?: string
          note?: string | null
          type?: Database["public"]["Enums"]["storage_location_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      subcontract_order_items: {
        Row: {
          art_nr: string
          description: string | null
          id: string
          order_id: string
          qty_issued: number
          qty_returned: number
          quantity: number
        }
        Insert: {
          art_nr: string
          description?: string | null
          id?: string
          order_id: string
          qty_issued?: number
          qty_returned?: number
          quantity: number
        }
        Update: {
          art_nr?: string
          description?: string | null
          id?: string
          order_id?: string
          qty_issued?: number
          qty_returned?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_order_items_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
          {
            foreignKeyName: "subcontract_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "subcontract_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontract_orders: {
        Row: {
          created_at: string
          created_by: string
          expected_at: string | null
          external_warehouse_id: string | null
          id: string
          note: string | null
          order_no: string
          production_order_id: string | null
          status: string
          supplier_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          expected_at?: string | null
          external_warehouse_id?: string | null
          id?: string
          note?: string | null
          order_no?: string
          production_order_id?: string | null
          status?: string
          supplier_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_at?: string | null
          external_warehouse_id?: string | null
          id?: string
          note?: string | null
          order_no?: string
          production_order_id?: string | null
          status?: string
          supplier_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_orders_external_warehouse_id_fkey"
            columns: ["external_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_orders_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_rating_summary"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "subcontract_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontract_receipt_items: {
        Row: {
          id: string
          item_id: string
          movement_id: string
          quantity: number
          receipt_id: string
        }
        Insert: {
          id?: string
          item_id: string
          movement_id: string
          quantity: number
          receipt_id: string
        }
        Update: {
          id?: string
          item_id?: string
          movement_id?: string
          quantity?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_receipt_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "subcontract_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_receipt_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "subcontract_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontract_receipts: {
        Row: {
          delivery_note_no: string | null
          id: string
          order_id: string
          receipt_no: string
          received_at: string
          received_by: string
          request_id: string | null
          warehouse_id: string
        }
        Insert: {
          delivery_note_no?: string | null
          id?: string
          order_id: string
          receipt_no?: string
          received_at?: string
          received_by?: string
          request_id?: string | null
          warehouse_id: string
        }
        Update: {
          delivery_note_no?: string | null
          id?: string
          order_id?: string
          receipt_no?: string
          received_at?: string
          received_by?: string
          request_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontract_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "subcontract_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontract_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_items: {
        Row: {
          art_nr: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number | null
          match_status: string | null
          po_item_id: string | null
          position: number
          quantity: number
          tax_rate: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          art_nr?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number | null
          match_status?: string | null
          po_item_id?: string | null
          position?: number
          quantity?: number
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          art_nr?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number | null
          match_status?: string | null
          po_item_id?: string | null
          position?: number
          quantity?: number
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attachment_path: string | null
          booked_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          gr_id: string | null
          id: string
          invoice_date: string | null
          invoice_no: string
          match_diff: number | null
          match_status: string | null
          notes: string | null
          po_id: string | null
          received_at: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["supplier_invoice_status"]
          subtotal_amount: number | null
          supplier_id: string | null
          supplier_invoice_no: string | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_path?: string | null
          booked_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          gr_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no: string
          match_diff?: number | null
          match_status?: string | null
          notes?: string | null
          po_id?: string | null
          received_at?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["supplier_invoice_status"]
          subtotal_amount?: number | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attachment_path?: string | null
          booked_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          gr_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_no?: string
          match_diff?: number | null
          match_status?: string | null
          notes?: string | null
          po_id?: string | null
          received_at?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["supplier_invoice_status"]
          subtotal_amount?: number | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_gr_id_fkey"
            columns: ["gr_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_rating_summary"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ratings: {
        Row: {
          case_id: string | null
          comment: string | null
          communication: number
          created_at: string
          delivery: number
          id: string
          price: number
          quality: number
          rated_by: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          comment?: string | null
          communication: number
          created_at?: string
          delivery: number
          id?: string
          price: number
          quality: number
          rated_by: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          comment?: string | null
          communication?: number
          created_at?: string
          delivery?: number
          id?: string
          price?: number
          quality?: number
          rated_by?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ratings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_rating_summary"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "supplier_ratings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          code: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
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
          sidebar_compact: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          compact_tables?: boolean
          dashboard_chart_range?: string
          dashboard_status_filters?: string[]
          sidebar_compact?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          compact_tables?: boolean
          dashboard_chart_range?: string
          dashboard_status_filters?: string[]
          sidebar_compact?: boolean
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
      user_satisfaction_surveys: {
        Row: {
          design_improvements: string | null
          id: string
          missing_features: string | null
          other: string | null
          score_design: number
          score_functionality: number
          score_performance: number
          submitted_at: string
          user_id: string
        }
        Insert: {
          design_improvements?: string | null
          id?: string
          missing_features?: string | null
          other?: string | null
          score_design: number
          score_functionality: number
          score_performance: number
          submitted_at?: string
          user_id: string
        }
        Update: {
          design_improvements?: string | null
          id?: string
          missing_features?: string | null
          other?: string | null
          score_design?: number
          score_functionality?: number
          score_performance?: number
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
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
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
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
      inventory_available: {
        Row: {
          art_nr: string | null
          quantity_available: number | null
          quantity_on_hand: number | null
          quantity_reserved: number | null
          warehouse_id: string | null
        }
        Insert: {
          art_nr?: string | null
          quantity_available?: never
          quantity_on_hand?: number | null
          quantity_reserved?: never
          warehouse_id?: string | null
        }
        Update: {
          art_nr?: string | null
          quantity_available?: never
          quantity_on_hand?: number | null
          quantity_reserved?: never
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_art_nr_fkey"
            columns: ["art_nr"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["art_nr"]
          },
          {
            foreignKeyName: "inventory_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_rating_summary: {
        Row: {
          avg_communication: number | null
          avg_delivery: number | null
          avg_overall: number | null
          avg_price: number | null
          avg_quality: number | null
          rating_count: number | null
          supplier_id: string | null
          supplier_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _erp_actor_name: { Args: { uid: string }; Returns: string }
      _guard_invoice_writer: { Args: never; Returns: undefined }
      _order_net_tax: {
        Args: { _order_id: string }
        Returns: Record<string, unknown>
      }
      add_stock_count_item: {
        Args: { _art_nr: string; _count_id: string }
        Returns: undefined
      }
      apply_case_status_from_doc: {
        Args: {
          _action: string
          _case_id: string
          _message: string
          _target: Database["public"]["Enums"]["case_status"]
        }
        Returns: undefined
      }
      approve_supplier_invoice: {
        Args: { _approve: boolean; _invoice_id: string; _reason?: string }
        Returns: undefined
      }
      archive_old_announcements: { Args: never; Returns: number }
      book_subcontract_receipt: {
        Args: {
          _delivery_note_no?: string
          _id: string
          _items: Json
          _request_id: string
          _warehouse_id: string
        }
        Returns: string
      }
      book_to_sperrlager: {
        Args: {
          _qty?: number
          _reason?: string
          _sperr_location_id?: string
          _stock_location_id: string
        }
        Returns: Json
      }
      build_tracking_url: {
        Args: { _carrier: string; _tracking_no: string }
        Returns: string
      }
      calculate_lead_score: {
        Args: { _lead: Database["public"]["Tables"]["leads"]["Row"] }
        Returns: number
      }
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
      can_view_attendance: {
        Args: { p_target_user: string; p_uid?: string }
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
      cancel_stock_count: { Args: { _count_id: string }; Returns: undefined }
      cancel_subcontract_order: { Args: { _id: string }; Returns: undefined }
      case_department: { Args: { p_case_id: string }; Returns: string }
      case_dept_owner: { Args: { p_case_id: string }; Returns: string }
      check_is_admin: { Args: { uid?: string }; Returns: boolean }
      check_is_manager: { Args: { uid?: string }; Returns: boolean }
      check_po_delays: { Args: never; Returns: Json }
      close_order_handoff: {
        Args: { _order_id: string; _reason: string; _stage: string }
        Returns: undefined
      }
      create_final_invoice: {
        Args: { _note?: string; _order_id: string }
        Returns: string
      }
      create_partial_invoice: {
        Args: {
          _net_amount?: number
          _note?: string
          _order_id: string
          _percent?: number
        }
        Returns: string
      }
      create_po_from_suggestions: {
        Args: {
          _items: Json
          _supplier_lief_nr: string
          _supplier_name: string
        }
        Returns: string
      }
      create_production_order: {
        Args: {
          _art_nr: string
          _case_id?: string
          _note?: string
          _order_id?: string
          _quantity: number
          _warehouse_id: string
        }
        Returns: string
      }
      create_production_subcontract_step: {
        Args: {
          _expected_at?: string
          _items: Json
          _note?: string
          _production_order_id: string
          _supplier_id: string
        }
        Returns: string
      }
      create_stock_count: {
        Args: { _note?: string; _warehouse_id: string }
        Returns: string
      }
      create_subcontract_order: {
        Args: {
          _expected_at?: string
          _items: Json
          _note?: string
          _supplier_id: string
          _warehouse_id: string
        }
        Returns: string
      }
      current_user_email: { Args: never; Returns: string }
      dept_has_matrix: { Args: { p_dept_id: string }; Returns: boolean }
      dept_member_role: {
        Args: { p_dept_id: string; p_uid: string }
        Returns: Database["public"]["Enums"]["dept_member_role"]
      }
      dept_owner: { Args: { p_dept_id: string }; Returns: string }
      find_duplicate_lots: {
        Args: { _art_nr: string; _lot_no: string }
        Returns: {
          art_nr: string
          current_qty: number
          expiry_date: string
          first_received_at: string
          id: string
          last_received_at: string
          lot_no: string
          lot_no_ext: string
          status: string
          supplier_lief_nr: string
          supplier_name: string
          total_received: number
        }[]
      }
      gen_next_customer_no: { Args: never; Returns: string }
      generate_delivery_no: { Args: never; Returns: string }
      generate_insurance_reminders: { Args: never; Returns: number }
      generate_invoice_no: { Args: never; Returns: string }
      generate_order_no: { Args: never; Returns: string }
      get_case_chat_unread: {
        Args: { p_case_ids: string[] }
        Returns: {
          case_id: string
          last_message_at: string
          unread_count: number
        }[]
      }
      get_case_chat_unread_total: { Args: never; Returns: number }
      get_disposition_overview: {
        Args: never
        Returns: {
          art_nr: string
          best_lief_nr: string
          best_price: number
          best_supplier_name: string
          bezeich_1: string
          me: string
          net_available: number
          on_hand: number
          open_demand: number
          open_supply: number
          primary_lief_nr: string
          primary_lieferzeit: number
          primary_price: number
          primary_supplier_name: string
          reorder_point: number
          reserved: number
          savings: number
          second_lief_nr: string
          second_lieferzeit: number
          second_price: number
          second_supplier_name: string
          shortage: number
          suggested_qty: number
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
      has_erp_access: { Args: { uid?: string }; Returns: boolean }
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
      invoice_recalc_payments: {
        Args: { p_invoice_id: string }
        Returns: undefined
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
      is_internal_user: { Args: never; Returns: boolean }
      is_portal_customer: { Args: { uid?: string }; Returns: boolean }
      is_private_inbox_dept: { Args: { p_dept_id: string }; Returns: boolean }
      is_project_manager: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_member: {
        Args: { p_project_id: string; uid?: string }
        Returns: boolean
      }
      is_project_watcher: {
        Args: { p_project_id: string; p_uid?: string }
        Returns: boolean
      }
      issue_subcontract_material: { Args: { _id: string }; Returns: undefined }
      lock_erp_document: {
        Args: { _id: string; _kind: string }
        Returns: boolean
      }
      log_case_pdf_print: {
        Args: { _case_id: string; _doc_label: string }
        Returns: undefined
      }
      mark_ai_messages_read: { Args: { p_vorgang_id: string }; Returns: number }
      mark_invoices_overdue: { Args: never; Returns: number }
      match_supplier_invoice: { Args: { _invoice_id: string }; Returns: Json }
      next_counter: { Args: { p_key: string }; Returns: number }
      next_partner_customer_no: { Args: never; Returns: string }
      next_partner_supplier_code: { Args: never; Returns: string }
      open_order_handoff: {
        Args: { _event: string; _order_id: string; _stage: string }
        Returns: undefined
      }
      own_profile_is_manager: { Args: { _uid: string }; Returns: boolean }
      po_effective_due: {
        Args: { _po: Database["public"]["Tables"]["purchase_orders"]["Row"] }
        Returns: string
      }
      policy_category: { Args: { p_policy_id: string }; Returns: string }
      post_stock_count: { Args: { _count_id: string }; Returns: number }
      production_order_availability: {
        Args: { _id: string }
        Returns: {
          component_art_nr: string
          description: string
          item_id: string
          pos: string
          qty_available: number
          qty_open: number
          shortage: number
        }[]
      }
      production_order_complete: {
        Args: { _id: string; _lot_no?: string; _qty?: number }
        Returns: Json
      }
      production_order_issue:
        | { Args: { _id: string }; Returns: Json }
        | { Args: { _allow_partial?: boolean; _id: string }; Returns: Json }
      purge_old_trashed_boards: { Args: never; Returns: undefined }
      purge_old_trashed_notes: { Args: never; Returns: undefined }
      purge_trashed_cases: { Args: never; Returns: number }
      recalc_case_effective_urgency: {
        Args: { _case_id: string }
        Returns: undefined
      }
      recalc_order_item_progress: {
        Args: { _order_item_id: string }
        Returns: undefined
      }
      recalc_order_status: { Args: { _order_id: string }; Returns: undefined }
      receive_subcontract_material: {
        Args: {
          _delivery_note_no?: string
          _id: string
          _items: Json
          _warehouse_id: string
        }
        Returns: string
      }
      recompute_case_urgency: {
        Args: { p_case_id: string }
        Returns: undefined
      }
      recompute_project_urgency: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      require_subcontract_writer: { Args: never; Returns: undefined }
      restore_deleted_case: { Args: { p_deleted_id: string }; Returns: string }
      set_own_active_session_token: {
        Args: { _token: string }
        Returns: undefined
      }
      suggest_po_from_deal: {
        Args: { _deal_id: string }
        Returns: {
          art_nr: string
          description: string
          lief_nr: string
          lieferzeit: number
          on_hand: number
          qty_needed: number
          qty_to_order: number
          supplier_name: string
          unit_price: number
        }[]
      }
      suggest_storage_locations: {
        Args: { _art_nr: string }
        Returns: {
          behaelter: string
          capacity: number
          code: string
          current_bestand: number
          fifo_required: boolean
          id: string
          lager: string
          lagerpl: string
          reason: string
          score: number
          type: Database["public"]["Enums"]["storage_location_type"]
        }[]
      }
      unlock_erp_document: {
        Args: { _id: string; _kind: string; _reason: string }
        Returns: boolean
      }
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
      partner_role: "lead" | "customer" | "supplier" | "both"
      po_status: "draft" | "ordered" | "partial" | "received" | "cancelled"
      product_request_status: "ausstehend" | "genehmigt" | "abgelehnt"
      protection_scope: "global" | "department" | "subsidiary"
      protection_status: "aktiv" | "abgelaufen" | "strittig"
      sequence_channel: "email" | "task"
      sequence_enrollment_status:
        | "active"
        | "paused"
        | "done"
        | "aktiv"
        | "pausiert"
        | "abgeschlossen"
        | "abgemeldet"
        | "geantwortet"
        | "failed"
      sequence_status: "aktiv" | "pausiert"
      sequence_step_type: "email" | "wait" | "task"
      stock_movement_type: "inbound" | "outbound" | "adjustment" | "transfer"
      storage_location_type:
        | "regal"
        | "kanban"
        | "sperrlager"
        | "archiv"
        | "versand"
        | "sonstiges"
      supplier_invoice_status:
        | "open"
        | "matched"
        | "approved"
        | "rejected"
        | "booked"
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
      partner_role: ["lead", "customer", "supplier", "both"],
      po_status: ["draft", "ordered", "partial", "received", "cancelled"],
      product_request_status: ["ausstehend", "genehmigt", "abgelehnt"],
      protection_scope: ["global", "department", "subsidiary"],
      protection_status: ["aktiv", "abgelaufen", "strittig"],
      sequence_channel: ["email", "task"],
      sequence_enrollment_status: [
        "active",
        "paused",
        "done",
        "aktiv",
        "pausiert",
        "abgeschlossen",
        "abgemeldet",
        "geantwortet",
        "failed",
      ],
      sequence_status: ["aktiv", "pausiert"],
      sequence_step_type: ["email", "wait", "task"],
      stock_movement_type: ["inbound", "outbound", "adjustment", "transfer"],
      storage_location_type: [
        "regal",
        "kanban",
        "sperrlager",
        "archiv",
        "versand",
        "sonstiges",
      ],
      supplier_invoice_status: [
        "open",
        "matched",
        "approved",
        "rejected",
        "booked",
      ],
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
