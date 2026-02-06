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
      case_activity: {
        Row: {
          action: string
          actor_id: string
          case_id: string
          created_at: string
          field: string | null
          id: string
          message: string | null
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          actor_id: string
          case_id: string
          created_at?: string
          field?: string | null
          id?: string
          message?: string | null
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          case_id?: string
          created_at?: string
          field?: string | null
          id?: string
          message?: string | null
          new_value?: string | null
          old_value?: string | null
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
        ]
      }
      cases: {
        Row: {
          assignee_id: string | null
          case_no: string
          client_name: string | null
          closed_at: string | null
          closed_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          customer_no: string | null
          due_at: string | null
          due_date_corrected_at: string | null
          due_date_corrected_by: string | null
          estimated_hours: number | null
          id: string
          internal_area_code: string | null
          last_changed_at: string | null
          last_changed_by: string | null
          note: string | null
          product_code: string | null
          project_article_no: string | null
          project_name: string
          received_at: string | null
          secondary_check_by: string | null
          secondary_check_confirmed_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["case_status"]
        }
        Insert: {
          assignee_id?: string | null
          case_no: string
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_no?: string | null
          due_at?: string | null
          due_date_corrected_at?: string | null
          due_date_corrected_by?: string | null
          estimated_hours?: number | null
          id?: string
          internal_area_code?: string | null
          last_changed_at?: string | null
          last_changed_by?: string | null
          note?: string | null
          product_code?: string | null
          project_article_no?: string | null
          project_name: string
          received_at?: string | null
          secondary_check_by?: string | null
          secondary_check_confirmed_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
        }
        Update: {
          assignee_id?: string | null
          case_no?: string
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          customer_no?: string | null
          due_at?: string | null
          due_date_corrected_at?: string | null
          due_date_corrected_by?: string | null
          estimated_hours?: number | null
          id?: string
          internal_area_code?: string | null
          last_changed_at?: string | null
          last_changed_by?: string | null
          note?: string | null
          product_code?: string | null
          project_article_no?: string | null
          project_name?: string
          received_at?: string | null
          secondary_check_by?: string | null
          secondary_check_confirmed_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
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
            foreignKeyName: "cases_secondary_check_by_fkey"
            columns: ["secondary_check_by"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          display_name: string
          id: string
          short_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id: string
          short_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          short_code?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff" | "viewer"
      case_status:
        | "nicht_begonnen"
        | "in_planung"
        | "in_arbeit"
        | "in_verzug"
        | "abgeschlossen"
        | "verworfen"
        | "archiv"
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
      app_role: ["admin", "staff", "viewer"],
      case_status: [
        "nicht_begonnen",
        "in_planung",
        "in_arbeit",
        "in_verzug",
        "abgeschlossen",
        "verworfen",
        "archiv",
      ],
    },
  },
} as const
