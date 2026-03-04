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
          case_number: string | null
          client_name: string | null
          closed_at: string | null
          closed_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          customer_no: string | null
          department_id: string | null
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
          project_id: string | null
          project_name: string
          received_at: string | null
          secondary_check_by: string | null
          secondary_check_confirmed_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["case_status"]
          visibility: string
        }
        Insert: {
          assignee_id?: string | null
          case_no: string
          case_number?: string | null
          client_name?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_no?: string | null
          department_id?: string | null
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
          project_id?: string | null
          project_name: string
          received_at?: string | null
          secondary_check_by?: string | null
          secondary_check_confirmed_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          visibility?: string
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
          created_by?: string
          customer_no?: string | null
          department_id?: string | null
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
          project_id?: string | null
          project_name?: string
          received_at?: string | null
          secondary_check_by?: string | null
          secondary_check_confirmed_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          visibility?: string
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
      departments: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          manager_user_id: string | null
          name: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_user_id?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_user_id?: string | null
          name?: string
          parent_id?: string | null
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
          actor_id: string
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
          actor_id: string
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
          actor_id?: string
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
      projects: {
        Row: {
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          id: string
          name: string
          owner_id: string | null
          project_code: string | null
          project_number: string | null
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id?: string | null
          project_code?: string | null
          project_number?: string | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          project_code?: string | null
          project_number?: string | null
          status?: string
          updated_at?: string
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
      support_tickets: {
        Row: {
          assigned_to: string | null
          closed_at: string | null
          created_at: string
          customer_id: string
          description: string
          id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          ticket_number: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id: string
          description: string
          id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          ticket_number?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          closed_at?: string | null
          created_at?: string
          customer_id?: string
          description?: string
          id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
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
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "portal_customers"
            referencedColumns: ["id"]
          },
        ]
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
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          compact_tables?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          compact_tables?: boolean
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_is_admin: { Args: { uid?: string }; Returns: boolean }
      check_is_manager: { Args: { uid?: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_direct_report: {
        Args: { manager_uid: string; target_uid: string }
        Returns: boolean
      }
      is_portal_customer: { Args: { uid?: string }; Returns: boolean }
      is_project_member: {
        Args: { p_project_id: string; uid?: string }
        Returns: boolean
      }
      next_counter: { Args: { p_key: string }; Returns: number }
      user_department: { Args: { uid?: string }; Returns: string }
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
