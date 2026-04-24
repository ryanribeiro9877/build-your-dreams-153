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
      agent_messages: {
        Row: {
          agent_id: string | null
          content: string
          created_at: string
          department_id: string | null
          id: string
          message_type: string
          metadata: Json | null
          sender_type: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          content: string
          created_at?: string
          department_id?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          sender_type?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          content?: string
          created_at?: string
          department_id?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          sender_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_orchestration_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          from_agent_id: string | null
          id: string
          task_id: string | null
          to_agent_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          from_agent_id?: string | null
          id?: string
          task_id?: string | null
          to_agent_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          from_agent_id?: string | null
          id?: string
          task_id?: string | null
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_orchestration_log_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_orchestration_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_orchestration_log_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_permissions: {
        Row: {
          agent_id: string
          created_at: string
          granted_by: string | null
          id: string
          permission: Database["public"]["Enums"]["permission_type"]
        }
        Insert: {
          agent_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: Database["public"]["Enums"]["permission_type"]
        }
        Update: {
          agent_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["permission_type"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_id: string
          agent_name: string | null
          assigned_by: string | null
          client_name: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          process_id: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_category: string
          task_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          assigned_by?: string | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          process_id?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_category?: string
          task_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          assigned_by?: string | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          process_id?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_category?: string
          task_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          avatar: string
          can_orchestrate: boolean
          color: string
          created_at: string
          current_tasks: number
          department_id: string
          description: string | null
          id: string
          is_active: boolean
          max_concurrent_tasks: number
          max_processes_monitored: number | null
          name: string
          role: Database["public"]["Enums"]["agent_role"]
          status: Database["public"]["Enums"]["agent_status"]
          updated_at: string
        }
        Insert: {
          avatar?: string
          can_orchestrate?: boolean
          color?: string
          created_at?: string
          current_tasks?: number
          department_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_concurrent_tasks?: number
          max_processes_monitored?: number | null
          name: string
          role?: Database["public"]["Enums"]["agent_role"]
          status?: Database["public"]["Enums"]["agent_status"]
          updated_at?: string
        }
        Update: {
          avatar?: string
          can_orchestrate?: boolean
          color?: string
          created_at?: string
          current_tasks?: number
          department_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_concurrent_tasks?: number
          max_processes_monitored?: number | null
          name?: string
          role?: Database["public"]["Enums"]["agent_role"]
          status?: Database["public"]["Enums"]["agent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      bottleneck_notifications: {
        Row: {
          agent_name: string | null
          alert_type: string
          created_at: string
          department: string | null
          id: string
          is_read: boolean
          message: string
          severity: string
          user_id: string
        }
        Insert: {
          agent_name?: string | null
          alert_type: string
          created_at?: string
          department?: string | null
          id?: string
          is_read?: boolean
          message: string
          severity?: string
          user_id: string
        }
        Update: {
          agent_name?: string | null
          alert_type?: string
          created_at?: string
          department?: string | null
          id?: string
          is_read?: boolean
          message?: string
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      client_documents: {
        Row: {
          client_id: string
          created_at: string
          document_name: string
          document_type: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          uploaded_by: string
        }
        Insert: {
          client_id: string
          created_at?: string
          document_name: string
          document_type?: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by: string
        }
        Update: {
          client_id?: string
          created_at?: string
          document_name?: string
          document_type?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          cpf: string | null
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          responsible_lawyer_id: string | null
          rg: string | null
          state: string | null
          status: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          responsible_lawyer_id?: string | null
          rg?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          responsible_lawyer_id?: string | null
          rg?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_events: {
        Row: {
          created_at: string
          cta_id: string | null
          cta_label: string | null
          event_name: string
          id: string
          metadata: Json | null
          page_path: string | null
          referrer: string | null
          section: string | null
          session_id: string | null
        }
        Insert: {
          created_at?: string
          cta_id?: string | null
          cta_label?: string | null
          event_name: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          referrer?: string | null
          section?: string | null
          session_id?: string | null
        }
        Update: {
          created_at?: string
          cta_id?: string | null
          cta_label?: string | null
          event_name?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          referrer?: string | null
          section?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      processes: {
        Row: {
          client_name: string
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          next_hearing_date: string | null
          process_number: string
          responsible_lawyer: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          next_hearing_date?: string | null
          process_number: string
          responsible_lawyer?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          next_hearing_date?: string | null
          process_number?: string
          responsible_lawyer?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          display_name: string | null
          id: string
          job_title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      token_balances: {
        Row: {
          balance: number
          created_at: string
          id: string
          total_consumed: number
          total_purchased: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          total_consumed?: number
          total_purchased?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          total_consumed?: number
          total_purchased?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          transaction_type: Database["public"]["Enums"]["token_transaction_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_type: Database["public"]["Enums"]["token_transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_type?: Database["public"]["Enums"]["token_transaction_type"]
          user_id?: string
        }
        Relationships: []
      }
      ui_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json | null
          session_id: string | null
          surface: string | null
          target_id: string | null
          target_label: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          surface?: string | null
          target_id?: string | null
          target_label?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          surface?: string | null
          target_id?: string | null
          target_label?: string | null
          user_id?: string | null
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
      user_ui_preferences: {
        Row: {
          created_at: string
          id: string
          right_collapsed: boolean
          sidebar_collapsed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          right_collapsed?: boolean
          sidebar_collapsed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          right_collapsed?: boolean
          sidebar_collapsed?: boolean
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
      add_tokens: {
        Args: {
          p_amount: number
          p_description?: string
          p_reference_id?: string
          p_type?: Database["public"]["Enums"]["token_transaction_type"]
          p_user_id: string
        }
        Returns: undefined
      }
      consume_tokens: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agent_role:
        | "director"
        | "orchestrator"
        | "manager"
        | "specialist"
        | "reviewer"
        | "executor"
        | "monitor"
      agent_status: "active" | "idle" | "alert" | "offline"
      app_role:
        | "admin"
        | "director"
        | "manager"
        | "lawyer"
        | "receptionist"
        | "intern"
        | "financial"
        | "marketing"
        | "protocol"
        | "calculator"
        | "compliance"
      permission_type:
        | "read"
        | "write"
        | "approve"
        | "execute"
        | "admin"
        | "monitor"
        | "schedule"
        | "contact_client"
        | "protocol"
        | "calculate"
        | "review_calculation"
        | "petition"
        | "market_study"
      task_priority: "critical" | "high" | "medium" | "low"
      task_status:
        | "pending"
        | "in_progress"
        | "review"
        | "approved"
        | "rejected"
        | "completed"
        | "cancelled"
      token_transaction_type: "purchase" | "consumption" | "bonus" | "refund"
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
      agent_role: [
        "director",
        "orchestrator",
        "manager",
        "specialist",
        "reviewer",
        "executor",
        "monitor",
      ],
      agent_status: ["active", "idle", "alert", "offline"],
      app_role: [
        "admin",
        "director",
        "manager",
        "lawyer",
        "receptionist",
        "intern",
        "financial",
        "marketing",
        "protocol",
        "calculator",
        "compliance",
      ],
      permission_type: [
        "read",
        "write",
        "approve",
        "execute",
        "admin",
        "monitor",
        "schedule",
        "contact_client",
        "protocol",
        "calculate",
        "review_calculation",
        "petition",
        "market_study",
      ],
      task_priority: ["critical", "high", "medium", "low"],
      task_status: [
        "pending",
        "in_progress",
        "review",
        "approved",
        "rejected",
        "completed",
        "cancelled",
      ],
      token_transaction_type: ["purchase", "consumption", "bonus", "refund"],
    },
  },
} as const
