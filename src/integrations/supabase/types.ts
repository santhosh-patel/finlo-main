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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          id: string
          session_id: string
          sender: string
          text: string
          chart_data: Json | null
          assistant_actions: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          sender: string
          text: string
          chart_data?: Json | null
          assistant_actions?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          sender?: string
          text?: string
          chart_data?: Json | null
          assistant_actions?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      ai_chat_sessions: {
        Row: {
          id: string
          user_id: string
          title: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          created_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount_monthly: number
          category: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_monthly: number
          category: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_monthly?: number
          category?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          subcategories: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          subcategories?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          subcategories?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      category_suggestions: {
        Row: {
          category: string
          confidence: number
          created_at: string
          note_normalized: string
          subcategory: string | null
          user_id: string
        }
        Insert: {
          category: string
          confidence?: number
          created_at?: string
          note_normalized: string
          subcategory?: string | null
          user_id: string
        }
        Update: {
          category?: string
          confidence?: number
          created_at?: string
          note_normalized?: string
          subcategory?: string | null
          user_id?: string
        }
        Relationships: []
      }
      expense_history: {
        Row: {
          action: string
          changed_at: string
          expense_id: string
          id: string
          snapshot: Json
          user_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          expense_id: string
          id?: string
          snapshot: Json
          user_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          expense_id?: string
          id?: string
          snapshot?: Json
          user_id?: string
        }
        Relationships: []
      }
      expense_splits: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          note: string | null
          parent_expense_id: string
          subcategory: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          id?: string
          note?: string | null
          parent_expense_id: string
          subcategory?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          note?: string | null
          parent_expense_id?: string
          subcategory?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_parent_expense_id_fkey"
            columns: ["parent_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_tags: {
        Row: {
          expense_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          expense_id: string
          tag_id: string
          user_id: string
        }
        Update: {
          expense_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_tags_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          auto_generated: boolean
          base_amount: number | null
          category: string
          client_updated_at: string
          created_at: string
          currency: string
          date: string
          deleted_at: string | null
          fx_rate: number
          id: string
          import_hash: string | null
          is_reimbursable: boolean
          note: string | null
          payment_method: string
          receipt_url: string | null
          reimbursed_at: string | null
          subcategory: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          auto_generated?: boolean
          base_amount?: number | null
          category: string
          client_updated_at?: string
          created_at?: string
          currency?: string
          date: string
          deleted_at?: string | null
          fx_rate?: number
          id?: string
          import_hash?: string | null
          is_reimbursable?: boolean
          note?: string | null
          payment_method?: string
          receipt_url?: string | null
          reimbursed_at?: string | null
          subcategory?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          auto_generated?: boolean
          base_amount?: number | null
          category?: string
          client_updated_at?: string
          created_at?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          fx_rate?: number
          id?: string
          import_hash?: string | null
          is_reimbursable?: boolean
          note?: string | null
          payment_method?: string
          receipt_url?: string | null
          reimbursed_at?: string | null
          subcategory?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          base: string
          date: string
          quote: string
          rate: number
        }
        Insert: {
          base: string
          date: string
          quote: string
          rate: number
        }
        Update: {
          base?: string
          date?: string
          quote?: string
          rate?: number
        }
        Relationships: []
      }
      insight_cache: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          key: string
          payload: Json
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          amount: number
          counterparty: string
          created_at: string
          currency: string
          date: string
          direction: string
          due_date: string | null
          expense_id: string | null
          id: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          counterparty: string
          created_at?: string
          currency?: string
          date: string
          direction: string
          due_date?: string | null
          expense_id?: string | null
          id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          counterparty?: string
          created_at?: string
          currency?: string
          date?: string
          direction?: string
          due_date?: string | null
          expense_id?: string | null
          id?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          frequency: string
          id: string
          last_run_date: string | null
          next_due_date: string
          note: string | null
          payment_method: string
          subcategory: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          category: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          next_due_date: string
          note?: string | null
          payment_method?: string
          subcategory?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          next_due_date?: string
          note?: string | null
          payment_method?: string
          subcategory?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
