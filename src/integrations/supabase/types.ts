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
      agent_actions: {
        Row: {
          agent_id: string | null
          args: Json
          created_at: string
          executed_at: string | null
          id: string
          result: Json | null
          run_id: string | null
          session_id: string | null
          status: string
          tool: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          args?: Json
          created_at?: string
          executed_at?: string | null
          id?: string
          result?: Json | null
          run_id?: string | null
          session_id?: string | null
          status?: string
          tool: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          args?: Json
          created_at?: string
          executed_at?: string | null
          id?: string
          result?: Json | null
          run_id?: string | null
          session_id?: string | null
          status?: string
          tool?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "orchestration_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_document_links: {
        Row: {
          agent_id: string
          document_id: string
        }
        Insert: {
          agent_id: string
          document_id: string
        }
        Update: {
          agent_id?: string
          document_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_document_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_document_links_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_library"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_documents: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          file_name: string
          file_size: number
          id: string
          is_active: boolean
          mime_type: string | null
          sort_order: number
          storage_path: string
          updated_at: string
          uploader_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number
          id?: string
          is_active?: boolean
          mime_type?: string | null
          sort_order?: number
          storage_path: string
          updated_at?: string
          uploader_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number
          id?: string
          is_active?: boolean
          mime_type?: string | null
          sort_order?: number
          storage_path?: string
          updated_at?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_mcp_servers: {
        Row: {
          agent_id: string
          config: Json | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          mcp_server_id: string | null
          name: string
          updated_at: string | null
          url: string
        }
        Insert: {
          agent_id: string
          config?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          mcp_server_id?: string | null
          name: string
          updated_at?: string | null
          url: string
        }
        Update: {
          agent_id?: string
          config?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          mcp_server_id?: string | null
          name?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_mcp_servers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mcp_servers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_mcp_servers_mcp_server_id_fkey"
            columns: ["mcp_server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
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
            foreignKeyName: "agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
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
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          from_agent_id?: string | null
          id?: string
          task_id?: string | null
          to_agent_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          from_agent_id?: string | null
          id?: string
          task_id?: string | null
          to_agent_id?: string | null
          user_id?: string | null
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
            foreignKeyName: "agent_orchestration_log_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
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
          {
            foreignKeyName: "agent_orchestration_log_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
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
          {
            foreignKeyName: "agent_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
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
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
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
      agent_templates: {
        Row: {
          area: Database["public"]["Enums"]["legal_area"] | null
          code: string
          created_at: string
          default_color: string
          default_max_tokens: number
          default_model: string
          default_provider: Database["public"]["Enums"]["provider_code"]
          default_system_prompt: string | null
          default_temperature: number
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["agent_role"]
          sort_order: number
          stage: Database["public"]["Enums"]["org_stage"] | null
          updated_at: string
        }
        Insert: {
          area?: Database["public"]["Enums"]["legal_area"] | null
          code: string
          created_at?: string
          default_color?: string
          default_max_tokens?: number
          default_model?: string
          default_provider?: Database["public"]["Enums"]["provider_code"]
          default_system_prompt?: string | null
          default_temperature?: number
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["agent_role"]
          sort_order?: number
          stage?: Database["public"]["Enums"]["org_stage"] | null
          updated_at?: string
        }
        Update: {
          area?: Database["public"]["Enums"]["legal_area"] | null
          code?: string
          created_at?: string
          default_color?: string
          default_max_tokens?: number
          default_model?: string
          default_provider?: Database["public"]["Enums"]["provider_code"]
          default_system_prompt?: string | null
          default_temperature?: number
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["agent_role"]
          sort_order?: number
          stage?: Database["public"]["Enums"]["org_stage"] | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_tools: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          tool_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          tool_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tool_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_traces: {
        Row: {
          agent_id: string | null
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          ended_at: string | null
          error_message: string | null
          id: string
          input_summary: string | null
          input_tokens: number | null
          metadata: Json | null
          model: string | null
          operation_name: string
          output_summary: string | null
          output_tokens: number | null
          parent_span_id: string | null
          session_id: string | null
          span_id: string
          span_kind: string
          started_at: string
          status: string
          trace_id: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          input_summary?: string | null
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          operation_name: string
          output_summary?: string | null
          output_tokens?: number | null
          parent_span_id?: string | null
          session_id?: string | null
          span_id: string
          span_kind: string
          started_at: string
          status?: string
          trace_id: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          id?: string
          input_summary?: string | null
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          operation_name?: string
          output_summary?: string | null
          output_tokens?: number | null
          parent_span_id?: string | null
          session_id?: string | null
          span_id?: string
          span_kind?: string
          started_at?: string
          status?: string
          trace_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_traces_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_traces_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_traces_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          allow_fallbacks: boolean | null
          allowed_tools: string[]
          avatar: string
          can_orchestrate: boolean
          color: string
          created_at: string
          current_tasks: number
          department_id: string
          description: string | null
          external_id: number | null
          history_limit: number | null
          id: string
          is_active: boolean
          is_overridden: boolean
          is_personal: boolean
          level: number
          max_concurrent_tasks: number
          max_processes_monitored: number | null
          max_tokens: number | null
          memory_enabled: boolean | null
          model: string | null
          name: string
          owner_user_id: string | null
          provider: string | null
          reports_to: number | null
          role: Database["public"]["Enums"]["agent_role"]
          source_template_id: string | null
          status: Database["public"]["Enums"]["agent_status"]
          system_prompt: string | null
          temperature: number | null
          top_p: number | null
          updated_at: string
        }
        Insert: {
          allow_fallbacks?: boolean | null
          allowed_tools?: string[]
          avatar?: string
          can_orchestrate?: boolean
          color?: string
          created_at?: string
          current_tasks?: number
          department_id: string
          description?: string | null
          external_id?: number | null
          history_limit?: number | null
          id?: string
          is_active?: boolean
          is_overridden?: boolean
          is_personal?: boolean
          level: number
          max_concurrent_tasks?: number
          max_processes_monitored?: number | null
          max_tokens?: number | null
          memory_enabled?: boolean | null
          model?: string | null
          name: string
          owner_user_id?: string | null
          provider?: string | null
          reports_to?: number | null
          role?: Database["public"]["Enums"]["agent_role"]
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          system_prompt?: string | null
          temperature?: number | null
          top_p?: number | null
          updated_at?: string
        }
        Update: {
          allow_fallbacks?: boolean | null
          allowed_tools?: string[]
          avatar?: string
          can_orchestrate?: boolean
          color?: string
          created_at?: string
          current_tasks?: number
          department_id?: string
          description?: string | null
          external_id?: number | null
          history_limit?: number | null
          id?: string
          is_active?: boolean
          is_overridden?: boolean
          is_personal?: boolean
          level?: number
          max_concurrent_tasks?: number
          max_processes_monitored?: number | null
          max_tokens?: number | null
          memory_enabled?: boolean | null
          model?: string | null
          name?: string
          owner_user_id?: string | null
          provider?: string | null
          reports_to?: number | null
          role?: Database["public"]["Enums"]["agent_role"]
          source_template_id?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          system_prompt?: string | null
          temperature?: number | null
          top_p?: number | null
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
          {
            foreignKeyName: "agents_source_template_fk"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "agent_templates"
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
      captacao_canais: {
        Row: {
          code: string
          created_at: string
          default_assignee_role_code: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          metadata: Json
          tipo: Database["public"]["Enums"]["captacao_canal_tipo"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_assignee_role_code?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          metadata?: Json
          tipo: Database["public"]["Enums"]["captacao_canal_tipo"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_assignee_role_code?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          tipo?: Database["public"]["Enums"]["captacao_canal_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      chat_attachments: {
        Row: {
          created_at: string
          extracted_text: string | null
          file_name: string
          file_size: number | null
          id: string
          is_active: boolean
          message_id: string | null
          mime_type: string | null
          session_id: string | null
          storage_path: string
          summary: string | null
          summary_generated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          message_id?: string | null
          mime_type?: string | null
          session_id?: string | null
          storage_path: string
          summary?: string | null
          summary_generated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          message_id?: string | null
          mime_type?: string | null
          session_id?: string | null
          storage_path?: string
          summary?: string | null
          summary_generated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          agent_id: string | null
          content: string | null
          cost_usd: number | null
          created_at: string | null
          duration_ms: number | null
          id: string
          input_tokens: number | null
          metadata: Json | null
          model_used: string | null
          output_tokens: number | null
          role: string
          sequence_number: number
          session_id: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_result: Json | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model_used?: string | null
          output_tokens?: number | null
          role: string
          sequence_number: number
          session_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_result?: Json | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          cost_usd?: number | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model_used?: string | null
          output_tokens?: number | null
          role?: string
          sequence_number?: number
          session_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_result?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          client_id: string | null
          closed_at: string | null
          created_at: string | null
          entry_agent_id: string | null
          id: string
          last_message_at: string | null
          message_count: number | null
          metadata: Json | null
          status: string
          summary: string | null
          title: string | null
          total_cost_usd: number | null
          total_tokens_input: number | null
          total_tokens_output: number | null
          total_tool_calls: number | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_agent_id?: string | null
          id?: string
          last_message_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          status?: string
          summary?: string | null
          title?: string | null
          total_cost_usd?: number | null
          total_tokens_input?: number | null
          total_tokens_output?: number | null
          total_tool_calls?: number | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_agent_id?: string | null
          id?: string
          last_message_at?: string | null
          message_count?: number | null
          metadata?: Json | null
          status?: string
          summary?: string | null
          title?: string | null
          total_cost_usd?: number | null
          total_tokens_input?: number | null
          total_tokens_output?: number | null
          total_tool_calls?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_entry_agent_id_fkey"
            columns: ["entry_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_entry_agent_id_fkey"
            columns: ["entry_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
        ]
      }
      client_document_events: {
        Row: {
          actor: string | null
          at: string
          client_id: string
          details: Json | null
          document_id: string | null
          event: string
          id: string
        }
        Insert: {
          actor?: string | null
          at?: string
          client_id: string
          details?: Json | null
          document_id?: string | null
          event: string
          id?: string
        }
        Update: {
          actor?: string | null
          at?: string
          client_id?: string
          details?: Json | null
          document_id?: string | null
          event?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "client_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          client_name: string | null
          created_at: string
          document_name: string
          document_type: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          origem: string | null
          status: string
          uploaded_by: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          client_id: string
          client_name?: string | null
          created_at?: string
          document_name: string
          document_type?: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          origem?: string | null
          status?: string
          uploaded_by: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          client_id?: string
          client_name?: string | null
          created_at?: string
          document_name?: string
          document_type?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          origem?: string | null
          status?: string
          uploaded_by?: string
          validated_at?: string | null
          validated_by?: string | null
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
          address_complement: string | null
          address_number: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          birth_date: string | null
          city: string | null
          client_origin: string | null
          cnpj: string | null
          country: string | null
          cpf: string | null
          created_at: string
          created_by: string
          email: string | null
          fantasy_name: string | null
          father_name: string | null
          foundation_date: string | null
          full_name: string
          gender: string | null
          gov_br_profile: string | null
          id: string
          ie: string | null
          im: string | null
          legal_rep_cpf: string | null
          legal_rep_name: string | null
          marital_status: string | null
          mother_name: string | null
          nationality: string | null
          natural_city: string | null
          natural_uf: string | null
          neighborhood: string | null
          notes: string | null
          phone: string | null
          phone_commercial: string | null
          phone_home: string | null
          pis_nit: string | null
          pix_key: string | null
          pix_key_type: string | null
          profession: string | null
          responsible_lawyer_id: string | null
          rg: string | null
          rg_issuer: string | null
          rg_uf: string | null
          state: string | null
          status: string
          tipo_pessoa: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          client_origin?: string | null
          cnpj?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          fantasy_name?: string | null
          father_name?: string | null
          foundation_date?: string | null
          full_name: string
          gender?: string | null
          gov_br_profile?: string | null
          id?: string
          ie?: string | null
          im?: string | null
          legal_rep_cpf?: string | null
          legal_rep_name?: string | null
          marital_status?: string | null
          mother_name?: string | null
          nationality?: string | null
          natural_city?: string | null
          natural_uf?: string | null
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          phone_commercial?: string | null
          phone_home?: string | null
          pis_nit?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profession?: string | null
          responsible_lawyer_id?: string | null
          rg?: string | null
          rg_issuer?: string | null
          rg_uf?: string | null
          state?: string | null
          status?: string
          tipo_pessoa?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          client_origin?: string | null
          cnpj?: string | null
          country?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          fantasy_name?: string | null
          father_name?: string | null
          foundation_date?: string | null
          full_name?: string
          gender?: string | null
          gov_br_profile?: string | null
          id?: string
          ie?: string | null
          im?: string | null
          legal_rep_cpf?: string | null
          legal_rep_name?: string | null
          marital_status?: string | null
          mother_name?: string | null
          nationality?: string | null
          natural_city?: string | null
          natural_uf?: string | null
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          phone_commercial?: string | null
          phone_home?: string | null
          pis_nit?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          profession?: string | null
          responsible_lawyer_id?: string | null
          rg?: string | null
          rg_issuer?: string | null
          rg_uf?: string | null
          state?: string | null
          status?: string
          tipo_pessoa?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      cron_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          last_status: string | null
          name: string
          params: Json
          schedule: string
          target: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_status?: string | null
          name: string
          params?: Json
          schedule: string
          target: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          params?: Json
          schedule?: string
          target?: string
          updated_at?: string
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
      document_library: {
        Row: {
          acao_tipo: string | null
          categoria: string | null
          content_cache: string | null
          created_at: string
          description: string | null
          doc_type: string | null
          file_name: string
          file_size: number | null
          id: string
          is_active: boolean
          match_keywords: string[] | null
          mime_type: string | null
          reu_categoria: string | null
          sort_order: number
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          acao_tipo?: string | null
          categoria?: string | null
          content_cache?: string | null
          created_at?: string
          description?: string | null
          doc_type?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          match_keywords?: string[] | null
          mime_type?: string | null
          reu_categoria?: string | null
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          acao_tipo?: string | null
          categoria?: string | null
          content_cache?: string | null
          created_at?: string
          description?: string | null
          doc_type?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          match_keywords?: string[] | null
          mime_type?: string | null
          reu_categoria?: string | null
          sort_order?: number
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      edge_runtime_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      email_notifications: {
        Row: {
          attempts: number
          body_html: string
          body_text: string | null
          created_at: string
          id: string
          last_error: string | null
          recipient_email: string
          recipient_user_id: string
          related_request_id: string | null
          related_task_id: string | null
          resend_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_notification_status"]
          subject: string
          type: Database["public"]["Enums"]["email_notification_type"]
        }
        Insert: {
          attempts?: number
          body_html: string
          body_text?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          recipient_email: string
          recipient_user_id: string
          related_request_id?: string | null
          related_task_id?: string | null
          resend_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_notification_status"]
          subject: string
          type: Database["public"]["Enums"]["email_notification_type"]
        }
        Update: {
          attempts?: number
          body_html?: string
          body_text?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          recipient_email?: string
          recipient_user_id?: string
          related_request_id?: string | null
          related_task_id?: string | null
          resend_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_notification_status"]
          subject?: string
          type?: Database["public"]["Enums"]["email_notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "email_notifications_related_request_id_fkey"
            columns: ["related_request_id"]
            isOneToOne: false
            referencedRelation: "inter_assistant_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notifications_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      external_collaborators: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone_whatsapp: string | null
          role_template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone_whatsapp?: string | null
          role_template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone_whatsapp?: string | null
          role_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_collaborators_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_api_audit_log: {
        Row: {
          action: string
          client_ip: string | null
          created_at: string
          error_code: string | null
          id: string
          method: string
          path: string | null
          payload_summary: Json
          status_code: number
        }
        Insert: {
          action: string
          client_ip?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          method: string
          path?: string | null
          payload_summary?: Json
          status_code: number
        }
        Update: {
          action?: string
          client_ip?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          method?: string
          path?: string | null
          payload_summary?: Json
          status_code?: number
        }
        Relationships: []
      }
      inter_assistant_requests: {
        Row: {
          answered_at: string | null
          created_at: string
          expires_at: string | null
          from_agent_id: string | null
          from_user_id: string
          id: string
          payload: Json
          related_session_id: string | null
          related_task_id: string | null
          request_type: string
          response_payload: Json | null
          status: Database["public"]["Enums"]["inter_assistant_status"]
          to_agent_id: string | null
          to_user_id: string
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          created_at?: string
          expires_at?: string | null
          from_agent_id?: string | null
          from_user_id: string
          id?: string
          payload?: Json
          related_session_id?: string | null
          related_task_id?: string | null
          request_type: string
          response_payload?: Json | null
          status?: Database["public"]["Enums"]["inter_assistant_status"]
          to_agent_id?: string | null
          to_user_id: string
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          created_at?: string
          expires_at?: string | null
          from_agent_id?: string | null
          from_user_id?: string
          id?: string
          payload?: Json
          related_session_id?: string | null
          related_task_id?: string | null
          request_type?: string
          response_payload?: Json | null
          status?: Database["public"]["Enums"]["inter_assistant_status"]
          to_agent_id?: string | null
          to_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_assistant_requests_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_assistant_requests_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_assistant_requests_related_session_id_fkey"
            columns: ["related_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_assistant_requests_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_assistant_requests_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_assistant_requests_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_owner_v"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_board_favorites: {
        Row: {
          board_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_board_favorites_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_board_grants: {
        Row: {
          board_id: string
          created_at: string
          grantee_role_code: string | null
          grantee_user_id: string | null
          id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          grantee_role_code?: string | null
          grantee_user_id?: string | null
          id?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          grantee_role_code?: string | null
          grantee_user_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_board_grants_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_boards: {
        Row: {
          created_at: string
          hide_completed_after_days: number | null
          id: string
          is_private: boolean
          name: string
          owner_user_id: string
          simplified_cards: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hide_completed_after_days?: number | null
          id?: string
          is_private?: boolean
          name: string
          owner_user_id: string
          simplified_cards?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hide_completed_after_days?: number | null
          id?: string
          is_private?: boolean
          name?: string
          owner_user_id?: string
          simplified_cards?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      kanban_card_placements: {
        Row: {
          board_id: string
          column_id: string
          created_at: string
          id: string
          position: number
          updated_at: string
          user_task_id: string
        }
        Insert: {
          board_id: string
          column_id: string
          created_at?: string
          id?: string
          position?: number
          updated_at?: string
          user_task_id: string
        }
        Update: {
          board_id?: string
          column_id?: string
          created_at?: string
          id?: string
          position?: number
          updated_at?: string
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_card_placements_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_card_placements_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_card_placements_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: true
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          board_id: string
          created_at: string
          id: string
          name: string
          position: number
          situacao: Database["public"]["Enums"]["task_situacao"]
          updated_at: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          situacao: Database["public"]["Enums"]["task_situacao"]
          updated_at?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          situacao?: Database["public"]["Enums"]["task_situacao"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_saved_filters: {
        Row: {
          created_at: string
          filter: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filter?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filter?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kanban_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
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
      leads: {
        Row: {
          assigned_to: string | null
          campanha: string | null
          canal_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          metadata: Json
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          campanha?: string | null
          canal_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          campanha?: string | null
          canal_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "captacao_canais"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_provider_configs: {
        Row: {
          api_key_last_4: string | null
          budget_period_start: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          last_used_at: string | null
          monthly_budget_usd: number | null
          monthly_spent_usd: number | null
          notes: string | null
          provider: string
          updated_at: string | null
          user_id: string
          vault_secret_id: string | null
        }
        Insert: {
          api_key_last_4?: string | null
          budget_period_start?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_used_at?: string | null
          monthly_budget_usd?: number | null
          monthly_spent_usd?: number | null
          notes?: string | null
          provider: string
          updated_at?: string | null
          user_id: string
          vault_secret_id?: string | null
        }
        Update: {
          api_key_last_4?: string | null
          budget_period_start?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_used_at?: string | null
          monthly_budget_usd?: number | null
          monthly_spent_usd?: number | null
          notes?: string | null
          provider?: string
          updated_at?: string | null
          user_id?: string
          vault_secret_id?: string | null
        }
        Relationships: []
      }
      mcp_servers: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          name: string
          required_credentials: Json
          slug: string | null
          transport: string
          updated_at: string
          url: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          required_credentials?: Json
          slug?: string | null
          transport?: string
          updated_at?: string
          url: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          required_credentials?: Json
          slug?: string | null
          transport?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      model_pricing: {
        Row: {
          context_window: number
          created_at: string | null
          display_name: string
          id: string
          input_price_per_mtok: number
          is_active: boolean | null
          max_output_tokens: number
          model_id: string
          notes: string | null
          output_price_per_mtok: number
          provider: string
          recommended_for: string[] | null
          supports_streaming: boolean | null
          supports_tools: boolean | null
          supports_vision: boolean | null
          tier: string
          updated_at: string | null
        }
        Insert: {
          context_window: number
          created_at?: string | null
          display_name: string
          id?: string
          input_price_per_mtok: number
          is_active?: boolean | null
          max_output_tokens: number
          model_id: string
          notes?: string | null
          output_price_per_mtok: number
          provider: string
          recommended_for?: string[] | null
          supports_streaming?: boolean | null
          supports_tools?: boolean | null
          supports_vision?: boolean | null
          tier: string
          updated_at?: string | null
        }
        Update: {
          context_window?: number
          created_at?: string | null
          display_name?: string
          id?: string
          input_price_per_mtok?: number
          is_active?: boolean | null
          max_output_tokens?: number
          model_id?: string
          notes?: string | null
          output_price_per_mtok?: number
          provider?: string
          recommended_for?: string[] | null
          supports_streaming?: boolean | null
          supports_tools?: boolean | null
          supports_vision?: boolean | null
          tier?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      orchestration_runs: {
        Row: {
          acao_tipo: string | null
          block_index: number
          blocks: Json
          chain: Json
          created_at: string
          draft: string | null
          entry_agent_id: string | null
          error: string | null
          feedback: string | null
          fixed_facts: string | null
          id: string
          iterations: number
          mech_report: Json | null
          n3_usage: Json | null
          original_message: string
          pending_actions: Json | null
          session_id: string
          status: string
          stream_message_id: string | null
          target_n2_id: string | null
          target_n3_id: string | null
          updated_at: string
          user_id: string
          user_message_id: string | null
        }
        Insert: {
          acao_tipo?: string | null
          block_index?: number
          blocks?: Json
          chain?: Json
          created_at?: string
          draft?: string | null
          entry_agent_id?: string | null
          error?: string | null
          feedback?: string | null
          fixed_facts?: string | null
          id?: string
          iterations?: number
          mech_report?: Json | null
          n3_usage?: Json | null
          original_message: string
          pending_actions?: Json | null
          session_id: string
          status?: string
          stream_message_id?: string | null
          target_n2_id?: string | null
          target_n3_id?: string | null
          updated_at?: string
          user_id: string
          user_message_id?: string | null
        }
        Update: {
          acao_tipo?: string | null
          block_index?: number
          blocks?: Json
          chain?: Json
          created_at?: string
          draft?: string | null
          entry_agent_id?: string | null
          error?: string | null
          feedback?: string | null
          fixed_facts?: string | null
          id?: string
          iterations?: number
          mech_report?: Json | null
          n3_usage?: Json | null
          original_message?: string
          pending_actions?: Json | null
          session_id?: string
          status?: string
          stream_message_id?: string | null
          target_n2_id?: string | null
          target_n3_id?: string | null
          updated_at?: string
          user_id?: string
          user_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_runs_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
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
          activated_at: string | null
          activation_status: string
          avatar_url: string | null
          created_at: string
          department: string | null
          display_name: string | null
          full_name: string | null
          id: string
          is_estagiario: boolean
          job_title: string | null
          organization_id: string | null
          role_template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          activation_status?: string
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          full_name?: string | null
          id?: string
          is_estagiario?: boolean
          job_title?: string | null
          organization_id?: string | null
          role_template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          activation_status?: string
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          full_name?: string | null
          id?: string
          is_estagiario?: boolean
          job_title?: string | null
          organization_id?: string | null
          role_template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_template_fk"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      role_agent_matrix: {
        Row: {
          agent_template_id: string
          created_at: string
          id: string
          is_default: boolean
          notes: string | null
          requires_is_estagiario: boolean | null
          role_template_id: string
        }
        Insert: {
          agent_template_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          notes?: string | null
          requires_is_estagiario?: boolean | null
          role_template_id: string
        }
        Update: {
          agent_template_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          notes?: string | null
          requires_is_estagiario?: boolean | null
          role_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_agent_matrix_agent_template_id_fkey"
            columns: ["agent_template_id"]
            isOneToOne: false
            referencedRelation: "agent_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_agent_matrix_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      role_coverage: {
        Row: {
          active_from: string
          active_until: string
          backup_user_id: string | null
          created_at: string
          id: string
          notes: string | null
          primary_user_id: string
          scope_area: Database["public"]["Enums"]["legal_area"] | null
          scope_stage: Database["public"]["Enums"]["org_stage"] | null
          status: Database["public"]["Enums"]["coverage_status"]
          updated_at: string
        }
        Insert: {
          active_from: string
          active_until: string
          backup_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          primary_user_id: string
          scope_area?: Database["public"]["Enums"]["legal_area"] | null
          scope_stage?: Database["public"]["Enums"]["org_stage"] | null
          status?: Database["public"]["Enums"]["coverage_status"]
          updated_at?: string
        }
        Update: {
          active_from?: string
          active_until?: string
          backup_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          primary_user_id?: string
          scope_area?: Database["public"]["Enums"]["legal_area"] | null
          scope_stage?: Database["public"]["Enums"]["org_stage"] | null
          status?: Database["public"]["Enums"]["coverage_status"]
          updated_at?: string
        }
        Relationships: []
      }
      role_task_matrix: {
        Row: {
          can_assign: boolean
          can_execute: boolean
          created_at: string
          id: string
          is_default_assignee: boolean
          notes: string | null
          role_template_id: string
          task_type_id: string
        }
        Insert: {
          can_assign?: boolean
          can_execute?: boolean
          created_at?: string
          id?: string
          is_default_assignee?: boolean
          notes?: string | null
          role_template_id: string
          task_type_id: string
        }
        Update: {
          can_assign?: boolean
          can_execute?: boolean
          created_at?: string
          id?: string
          is_default_assignee?: boolean
          notes?: string | null
          role_template_id?: string
          task_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_task_matrix_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "role_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_task_matrix_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
      }
      role_templates: {
        Row: {
          areas: Database["public"]["Enums"]["legal_area"][] | null
          can_assign_tasks: boolean
          code: string
          created_at: string
          description: string | null
          display_name: string
          has_login: boolean
          id: string
          is_admin: boolean
          sort_order: number
          stages: Database["public"]["Enums"]["org_stage"][]
          updated_at: string
        }
        Insert: {
          areas?: Database["public"]["Enums"]["legal_area"][] | null
          can_assign_tasks?: boolean
          code: string
          created_at?: string
          description?: string | null
          display_name: string
          has_login?: boolean
          id?: string
          is_admin?: boolean
          sort_order?: number
          stages: Database["public"]["Enums"]["org_stage"][]
          updated_at?: string
        }
        Update: {
          areas?: Database["public"]["Enums"]["legal_area"][] | null
          can_assign_tasks?: boolean
          code?: string
          created_at?: string
          description?: string | null
          display_name?: string
          has_login?: boolean
          id?: string
          is_admin?: boolean
          sort_order?: number
          stages?: Database["public"]["Enums"]["org_stage"][]
          updated_at?: string
        }
        Relationships: []
      }
      routing_exclusivities: {
        Row: {
          id: string
          notes: string | null
          owner_role: string
          reu_pattern: string
        }
        Insert: {
          id?: string
          notes?: string | null
          owner_role: string
          reu_pattern: string
        }
        Update: {
          id?: string
          notes?: string | null
          owner_role?: string
          reu_pattern?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          created_at: string
          description: string | null
          file_name: string
          file_size_bytes: number
          id: string
          mime_type: string | null
          storage_path: string
          task_id: string
          uploader_user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name: string
          file_size_bytes: number
          id?: string
          mime_type?: string | null
          storage_path: string
          task_id: string
          uploader_user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string | null
          storage_path?: string
          task_id?: string
          uploader_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          user_task_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_task_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_audit_log_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          body: string
          created_at: string
          done: boolean
          id: string
          position: number
          user_task_id: string
        }
        Insert: {
          body: string
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          user_task_id: string
        }
        Update: {
          body?: string
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          created_at: string
          tag_id: string
          user_task_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          user_task_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "kanban_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_time_entries: {
        Row: {
          created_at: string
          id: string
          minutes: number
          note: string | null
          user_id: string
          user_task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          minutes: number
          note?: string | null
          user_id: string
          user_task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          minutes?: number
          note?: string | null
          user_id?: string
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_time_entries_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          area: Database["public"]["Enums"]["legal_area"] | null
          code: string
          created_at: string
          default_sla_hours: number | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          requires_validation: boolean
          sort_order: number
          stage: Database["public"]["Enums"]["org_stage"]
          updated_at: string
          validator_role_code: string | null
        }
        Insert: {
          area?: Database["public"]["Enums"]["legal_area"] | null
          code: string
          created_at?: string
          default_sla_hours?: number | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          requires_validation?: boolean
          sort_order?: number
          stage: Database["public"]["Enums"]["org_stage"]
          updated_at?: string
          validator_role_code?: string | null
        }
        Update: {
          area?: Database["public"]["Enums"]["legal_area"] | null
          code?: string
          created_at?: string
          default_sla_hours?: number | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          requires_validation?: boolean
          sort_order?: number
          stage?: Database["public"]["Enums"]["org_stage"]
          updated_at?: string
          validator_role_code?: string | null
        }
        Relationships: []
      }
      task_workflow_instances: {
        Row: {
          id: string
          started_at: string
          started_by: string | null
          template_id: string | null
          template_name: string
          user_task_id: string
        }
        Insert: {
          id?: string
          started_at?: string
          started_by?: string | null
          template_id?: string | null
          template_name: string
          user_task_id: string
        }
        Update: {
          id?: string
          started_at?: string
          started_by?: string | null
          template_id?: string | null
          template_name?: string
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_workflow_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_workflow_instances_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_workflow_step_states: {
        Row: {
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          instance_id: string
          name: string
          position: number
        }
        Insert: {
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          instance_id: string
          name: string
          position?: number
        }
        Update: {
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          instance_id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_workflow_step_states_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "task_workflow_instances"
            referencedColumns: ["id"]
          },
        ]
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
      tool_catalog: {
        Row: {
          allowed_roles: string[] | null
          category: string
          code: string
          created_at: string
          description: string
          display_name: string
          icon: string | null
          id: string
          is_active: boolean
          sort_order: number
          tool_schema: Json
          updated_at: string
        }
        Insert: {
          allowed_roles?: string[] | null
          category?: string
          code: string
          created_at?: string
          description: string
          display_name: string
          icon?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          tool_schema?: Json
          updated_at?: string
        }
        Update: {
          allowed_roles?: string[] | null
          category?: string
          code?: string
          created_at?: string
          description?: string
          display_name?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          tool_schema?: Json
          updated_at?: string
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
      user_areas: {
        Row: {
          area: Database["public"]["Enums"]["legal_area"]
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          area: Database["public"]["Enums"]["legal_area"]
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          area?: Database["public"]["Enums"]["legal_area"]
          created_at?: string
          id?: string
          is_primary?: boolean
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
      user_task_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          mentioned_user_ids: string[]
          user_task_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          mentioned_user_ids?: string[]
          user_task_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          mentioned_user_ids?: string[]
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_task_comments_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tasks: {
        Row: {
          area: Database["public"]["Enums"]["legal_area"] | null
          assignee_external_id: string | null
          assignee_user_id: string | null
          assigner_user_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          data_fatal: string | null
          deadline_at: string | null
          departamento_atual: Database["public"]["Enums"]["org_stage"] | null
          description: string | null
          documentation_completed_at: string | null
          external_kanban_ref: string | null
          id: string
          is_pendencia: boolean
          notes: string | null
          origem_departamento: Database["public"]["Enums"]["org_stage"] | null
          origem_user_id: string | null
          payload: Json
          pendencia_estado: string | null
          pendencia_tipo: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          process_id: string | null
          situacao: Database["public"]["Enums"]["task_situacao"]
          status: Database["public"]["Enums"]["user_task_status"]
          task_type_id: string
          title: string
          updated_at: string
          validated_at: string | null
          validator_user_id: string | null
        }
        Insert: {
          area?: Database["public"]["Enums"]["legal_area"] | null
          assignee_external_id?: string | null
          assignee_user_id?: string | null
          assigner_user_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          data_fatal?: string | null
          deadline_at?: string | null
          departamento_atual?: Database["public"]["Enums"]["org_stage"] | null
          description?: string | null
          documentation_completed_at?: string | null
          external_kanban_ref?: string | null
          id?: string
          is_pendencia?: boolean
          notes?: string | null
          origem_departamento?: Database["public"]["Enums"]["org_stage"] | null
          origem_user_id?: string | null
          payload?: Json
          pendencia_estado?: string | null
          pendencia_tipo?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          process_id?: string | null
          situacao?: Database["public"]["Enums"]["task_situacao"]
          status?: Database["public"]["Enums"]["user_task_status"]
          task_type_id: string
          title: string
          updated_at?: string
          validated_at?: string | null
          validator_user_id?: string | null
        }
        Update: {
          area?: Database["public"]["Enums"]["legal_area"] | null
          assignee_external_id?: string | null
          assignee_user_id?: string | null
          assigner_user_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          data_fatal?: string | null
          deadline_at?: string | null
          departamento_atual?: Database["public"]["Enums"]["org_stage"] | null
          description?: string | null
          documentation_completed_at?: string | null
          external_kanban_ref?: string | null
          id?: string
          is_pendencia?: boolean
          notes?: string | null
          origem_departamento?: Database["public"]["Enums"]["org_stage"] | null
          origem_user_id?: string | null
          payload?: Json
          pendencia_estado?: string | null
          pendencia_tipo?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          process_id?: string | null
          situacao?: Database["public"]["Enums"]["task_situacao"]
          status?: Database["public"]["Enums"]["user_task_status"]
          task_type_id?: string
          title?: string
          updated_at?: string
          validated_at?: string | null
          validator_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_tasks_assignee_external_id_fkey"
            columns: ["assignee_external_id"]
            isOneToOne: false
            referencedRelation: "external_collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tasks_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
        ]
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
      workflow_template_steps: {
        Row: {
          id: string
          name: string
          position: number
          template_id: string
        }
        Insert: {
          id?: string
          name: string
          position?: number
          template_id: string
        }
        Update: {
          id?: string
          name?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      agents_with_owner_v: {
        Row: {
          can_orchestrate: boolean | null
          color: string | null
          current_tasks: number | null
          department_id: string | null
          department_name: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_overridden: boolean | null
          is_personal: boolean | null
          level: number | null
          max_concurrent_tasks: number | null
          name: string | null
          owner_display_name: string | null
          owner_role_code: string | null
          owner_role_label: string | null
          owner_user_id: string | null
          role: Database["public"]["Enums"]["agent_role"] | null
          source_template_id: string | null
          status: Database["public"]["Enums"]["agent_status"] | null
          template_area: Database["public"]["Enums"]["legal_area"] | null
          template_code: string | null
          template_stage: Database["public"]["Enums"]["org_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_source_template_fk"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "agent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_funnel: {
        Row: {
          campanha: string | null
          canal_code: string | null
          canal_display_name: string | null
          canal_id: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "captacao_canais"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          id: string
          client_id: string | null
          client_name: string | null
          phone: string | null
          scheduled_date: string
          start_time: string
          end_time: string | null
          type: string | null
          lawyer_user_id: string | null
          receptionist_user_id: string | null
          summary: string | null
          status: Database["public"]["Enums"]["meeting_status"]
          notes: string | null
          google_event_id: string | null
          google_calendar_id: string | null
          google_sync_status: string | null
          last_synced_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          client_name?: string | null
          phone?: string | null
          scheduled_date: string
          start_time: string
          end_time?: string | null
          type?: string | null
          lawyer_user_id?: string | null
          receptionist_user_id?: string | null
          summary?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          notes?: string | null
          google_event_id?: string | null
          google_calendar_id?: string | null
          google_sync_status?: string | null
          last_synced_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string | null
          client_name?: string | null
          phone?: string | null
          scheduled_date?: string
          start_time?: string
          end_time?: string | null
          type?: string | null
          lawyer_user_id?: string | null
          receptionist_user_id?: string | null
          summary?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          notes?: string | null
          google_event_id?: string | null
          google_calendar_id?: string | null
          google_sync_status?: string | null
          last_synced_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_audit_log: {
        Row: {
          id: string
          meeting_id: string
          actor_user_id: string | null
          field: string
          old_value: string | null
          new_value: string | null
          created_at: string
        }
        Insert: {
          id?: string
          meeting_id: string
          actor_user_id?: string | null
          field: string
          old_value?: string | null
          new_value?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          meeting_id?: string
          actor_user_id?: string | null
          field?: string
          old_value?: string | null
          new_value?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Functions: {
      activate_own_profile: { Args: never; Returns: undefined }
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
      advance_user_task: {
        Args: { p_next_task_type_id?: string; p_task_id: string }
        Returns: Json
      }
      answer_inter_assistant_request: {
        Args: {
          p_request_id: string
          p_response_payload: Json
          p_status?: Database["public"]["Enums"]["inter_assistant_status"]
        }
        Returns: Database["public"]["Enums"]["inter_assistant_status"]
      }
      append_chat_message: {
        Args: {
          p_agent_id?: string
          p_content?: string
          p_cost_usd?: number
          p_duration_ms?: number
          p_input_tokens?: number
          p_metadata?: Json
          p_model_used?: string
          p_output_tokens?: number
          p_role: string
          p_session_id: string
          p_tool_call_id?: string
          p_tool_calls?: Json
          p_tool_result?: Json
        }
        Returns: string
      }
      apply_employee_profile: {
        Args: {
          p_app_role: Database["public"]["Enums"]["app_role"]
          p_full_name: string
          p_is_estagiario: boolean
          p_role_template_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      calculate_llm_cost: {
        Args: {
          p_input_tokens: number
          p_model_id: string
          p_output_tokens: number
          p_provider: string
        }
        Returns: number
      }
      consume_tokens: {
        Args: { p_amount: number; p_description?: string; p_user_id: string }
        Returns: boolean
      }
      consume_tokens_with_ref: {
        Args: {
          p_amount: number
          p_description: string
          p_reference_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      create_inter_assistant_request: {
        Args: {
          p_expires_in_hours?: number
          p_payload?: Json
          p_related_task_id?: string
          p_request_type: string
          p_to_user_id: string
        }
        Returns: string
      }
      create_meeting: {
        Args: {
          p_scheduled_date: string
          p_start_time: string
          p_client_id?: string | null
          p_client_name?: string | null
          p_phone?: string | null
          p_end_time?: string | null
          p_type?: string | null
          p_lawyer_user_id?: string | null
          p_receptionist_user_id?: string | null
          p_summary?: string | null
          p_notes?: string | null
          p_status?: Database["public"]["Enums"]["meeting_status"]
        }
        Returns: string
      }
      create_user_task: {
        Args: {
          p_area?: Database["public"]["Enums"]["legal_area"]
          p_assignee_user_id: string
          p_client_id?: string
          p_deadline_at?: string
          p_description?: string
          p_external_kanban_ref?: string
          p_payload?: Json
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_process_id?: string
          p_task_type_id: string
          p_title: string
        }
        Returns: string
      }
      criar_pendencia: {
        Args: {
          p_cliente_id?: string
          p_data_fatal?: string
          p_departamento?: Database["public"]["Enums"]["org_stage"]
          p_descricao?: string
          p_prazo?: string
          p_responsavel_user_id?: string
          p_tipo: string
          p_titulo: string
        }
        Returns: string
      }
      create_meeting_task: {
        Args: { p_meeting_id: string }
        Returns: string
      }
      delete_meeting: {
        Args: { p_id: string }
        Returns: undefined
      }
      delete_task_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      enqueue_email_notification: {
        Args: {
          p_body_html: string
          p_body_text?: string
          p_recipient_user_id: string
          p_related_request_id?: string
          p_related_task_id?: string
          p_subject: string
          p_type: Database["public"]["Enums"]["email_notification_type"]
        }
        Returns: string
      }
      fail_stale_orchestration_runs: {
        Args: { p_max_age?: string }
        Returns: number
      }
      find_users_missing_agents: {
        Args: never
        Returns: {
          agentes_atuais: number
          cargo: string
          cargo_label: string
          email: string
          faltam: number
          full_name: string
          is_estagiario: boolean
          templates_esperados: number
          user_id: string
        }[]
      }
      finish_agent_trace: {
        Args: {
          p_cost_usd?: number
          p_error_message?: string
          p_input_tokens?: number
          p_output_summary?: string
          p_output_tokens?: number
          p_status: string
          p_trace_pk: string
        }
        Returns: undefined
      }
      get_active_provider_for_user: {
        Args: { p_provider: string; p_user_id: string }
        Returns: {
          config_id: string
          is_default: boolean
          monthly_budget_usd: number
          monthly_spent_usd: number
          provider: string
          vault_secret_id: string
        }[]
      }
      get_agent_tools: {
        Args: { p_agent_id: string }
        Returns: {
          tool_code: string
          tool_config: Json
          tool_name: string
          tool_schema: Json
        }[]
      }
      get_delegation_targets: {
        Args: { p_from_agent_id: string }
        Returns: {
          agent_id: string
          agent_name: string
          agent_role: string
          description: string
          template_code: string
        }[]
      }
      get_edge_runtime_secret: { Args: { p_key: string }; Returns: string }
      get_eligible_assignees: {
        Args: { p_task_type_id: string }
        Returns: {
          full_name: string
          is_estagiario: boolean
          role_code: string
          role_label: string
          user_id: string
        }[]
      }
      get_inbox_count: {
        Args: never
        Returns: {
          critical: number
          overdue: number
          total: number
        }[]
      }
      get_inter_assistant_inbox_count: { Args: never; Returns: number }
      get_kanban_board:
        | { Args: { p_board_id: string }; Returns: Json }
        | {
            Args: { p_include_completed?: boolean }
            Returns: {
              area: Database["public"]["Enums"]["legal_area"]
              assignee_name: string
              assignee_role_label: string
              assignee_user_id: string
              assigner_name: string
              assigner_user_id: string
              awaiting_role_code: string
              client_id: string
              created_at: string
              deadline_at: string
              id: string
              is_overdue: boolean
              owner_role_code: string
              owner_role_label: string
              priority: Database["public"]["Enums"]["task_priority"]
              process_id: string
              stage: Database["public"]["Enums"]["org_stage"]
              status: Database["public"]["Enums"]["user_task_status"]
              task_type_code: string
              task_type_id: string
              task_type_label: string
              title: string
            }[]
          }
      get_kanban_board_involvement: {
        Args: { p_board_id: string }
        Returns: {
          assigner_user_id: string
          user_task_id: string
          validator_user_id: string
        }[]
      }
      get_kanban_board_tags: {
        Args: { p_board_id: string }
        Returns: {
          tags: Json
          user_task_id: string
        }[]
      }
      get_kanban_boards: {
        Args: never
        Returns: {
          can_admin: boolean
          card_count: number
          created_at: string
          hide_completed_after_days: number
          id: string
          is_favorite: boolean
          is_owner: boolean
          is_private: boolean
          name: string
          owner_user_id: string
          simplified_cards: boolean
          sort_order: number
          updated_at: string
        }[]
      }
      get_kanban_tags: {
        Args: never
        Returns: {
          color: string
          id: string
          name: string
        }[]
      }
      get_available_slots: {
        Args: { p_date: string }
        Returns: {
          slot: string
        }[]
      }
      get_meeting_audit: {
        Args: { p_meeting_id: string }
        Returns: {
          id: string
          actor_user_id: string | null
          actor_name: string | null
          field: string
          old_value: string | null
          new_value: string | null
          created_at: string
        }[]
      }
      get_my_inbox: {
        Args: { p_include_completed?: boolean }
        Returns: {
          area: Database["public"]["Enums"]["legal_area"]
          assigner_name: string
          assigner_user_id: string
          client_id: string
          created_at: string
          deadline_at: string
          description: string
          documentation_completed_at: string
          external_kanban_ref: string
          id: string
          is_overdue: boolean
          notes: string
          priority: Database["public"]["Enums"]["task_priority"]
          process_id: string
          status: Database["public"]["Enums"]["user_task_status"]
          task_type_code: string
          task_type_label: string
          title: string
          updated_at: string
        }[]
      }
      get_my_inter_assistant_inbox: {
        Args: { p_include_finalized?: boolean }
        Returns: {
          created_at: string
          expires_at: string
          from_user_id: string
          from_user_name: string
          from_user_role_label: string
          id: string
          is_expired: boolean
          payload: Json
          related_task_id: string
          request_type: string
          status: Database["public"]["Enums"]["inter_assistant_status"]
        }[]
      }
      get_my_inter_assistant_outbox: {
        Args: { p_include_finalized?: boolean }
        Returns: {
          answered_at: string
          created_at: string
          id: string
          payload: Json
          related_task_id: string
          request_type: string
          response_payload: Json
          status: Database["public"]["Enums"]["inter_assistant_status"]
          to_user_id: string
          to_user_name: string
          to_user_role_label: string
        }[]
      }
      get_my_saved_filters: {
        Args: never
        Returns: {
          created_at: string
          filter: Json
          id: string
          name: string
        }[]
      }
      get_my_validation_queue: {
        Args: never
        Returns: {
          area: Database["public"]["Enums"]["legal_area"]
          assignee_name: string
          assignee_user_id: string
          created_at: string
          deadline_at: string
          description: string
          id: string
          is_overdue: boolean
          notes: string
          priority: Database["public"]["Enums"]["task_priority"]
          task_type_code: string
          task_type_label: string
          title: string
          updated_at: string
        }[]
      }
      get_my_workspace: { Args: never; Returns: Json }
      get_provider_key_decrypted: {
        Args: { p_provider: string; p_user_id: string }
        Returns: {
          config_id: string
          decrypted_key: string
          has_remaining_budget: boolean
          monthly_budget_usd: number
          monthly_spent_usd: number
        }[]
      }
      get_sector_workload: {
        Args: { p_target_role_code: string }
        Returns: {
          full_name: string
          is_least_loaded: boolean
          pending_count: number
          user_id: string
        }[]
      }
      get_task_attachments: {
        Args: { p_task_id: string }
        Returns: {
          created_at: string
          description: string
          file_name: string
          file_size_bytes: number
          id: string
          is_owner: boolean
          mime_type: string
          storage_path: string
          uploader_name: string
          uploader_user_id: string
        }[]
      }
      get_task_audit: {
        Args: { p_task_id: string }
        Returns: {
          actor_name: string
          actor_user_id: string
          created_at: string
          field: string
          id: string
          new_value: string
          old_value: string
        }[]
      }
      get_task_checklist: {
        Args: { p_task_id: string }
        Returns: {
          body: string
          done: boolean
          id: string
          position: number
        }[]
      }
      get_task_comments: {
        Args: { p_task_id: string }
        Returns: {
          author_name: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          mentioned_user_ids: string[]
        }[]
      }
      get_task_time_entries: {
        Args: { p_task_id: string }
        Returns: {
          created_at: string
          id: string
          minutes: number
          note: string
          total_minutes: number
          user_id: string
          user_name: string
        }[]
      }
      get_task_types_by_stage: {
        Args: never
        Returns: {
          area: Database["public"]["Enums"]["legal_area"]
          code: string
          default_sla_hours: number
          description: string
          display_name: string
          eligible_role_codes: string[]
          id: string
          stage: Database["public"]["Enums"]["org_stage"]
        }[]
      }
      get_task_workflow: { Args: { p_task_id: string }; Returns: Json }
      get_team_tasks: {
        Args: {
          p_assignee_user_id?: string
          p_include_completed?: boolean
          p_limit?: number
          p_status?: Database["public"]["Enums"]["user_task_status"]
        }
        Returns: {
          area: Database["public"]["Enums"]["legal_area"]
          assignee_name: string
          assignee_role_label: string
          assignee_user_id: string
          assigner_name: string
          assigner_user_id: string
          created_at: string
          deadline_at: string
          id: string
          is_overdue: boolean
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["user_task_status"]
          task_type_label: string
          title: string
        }[]
      }
      get_user_task_detail: { Args: { p_task_id: string }; Returns: Json }
      get_validation_count: { Args: never; Returns: number }
      get_workflow_templates: {
        Args: never
        Returns: {
          id: string
          name: string
          step_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_provider_spend: {
        Args: { p_config_id: string; p_cost: number }
        Returns: undefined
      }
      increment_session_counters: {
        Args: {
          p_cost: number
          p_session_id: string
          p_tokens_in: number
          p_tokens_out: number
        }
        Returns: undefined
      }
      integration_list_rpcs: { Args: never; Returns: string[] }
      integration_list_tables: { Args: never; Returns: string[] }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_own_profile_active: { Args: never; Returns: boolean }
      is_recepcao_or_socio: { Args: never; Returns: boolean }
      is_role_eligible_for_task: {
        Args: { p_role_template_id: string; p_task_type_id: string }
        Returns: boolean
      }
      kanban_add_checklist_item: {
        Args: { p_body: string; p_task_id: string }
        Returns: string
      }
      kanban_add_comment: {
        Args: { p_body: string; p_mentioned: string[]; p_task_id: string }
        Returns: string
      }
      kanban_add_task_to_board: {
        Args: { p_column_id: string; p_task_id: string }
        Returns: undefined
      }
      kanban_add_time_entry: {
        Args: { p_minutes: number; p_note: string; p_task_id: string }
        Returns: string
      }
      kanban_can_access_board: {
        Args: { p_board_id: string; p_uid: string }
        Returns: boolean
      }
      kanban_can_admin: { Args: { p_uid: string }; Returns: boolean }
      kanban_can_edit_task: {
        Args: { p_task_id: string; p_uid: string }
        Returns: boolean
      }
      kanban_create_board: {
        Args: {
          p_hide_completed_after_days?: number
          p_is_private?: boolean
          p_name: string
          p_simplified_cards?: boolean
        }
        Returns: string
      }
      kanban_create_workflow_template: {
        Args: { p_name: string; p_steps: string[] }
        Returns: string
      }
      kanban_delete_board: { Args: { p_board_id: string }; Returns: undefined }
      kanban_delete_checklist_item: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      kanban_delete_saved_filter: { Args: { p_id: string }; Returns: undefined }
      kanban_delete_time_entry: { Args: { p_id: string }; Returns: undefined }
      kanban_delete_workflow_template: {
        Args: { p_id: string }
        Returns: undefined
      }
      kanban_move_card: {
        Args: { p_column_id: string; p_position?: number; p_task_id: string }
        Returns: undefined
      }
      kanban_next_stage: {
        Args: { p_stage: Database["public"]["Enums"]["org_stage"] }
        Returns: Database["public"]["Enums"]["org_stage"]
      }
      kanban_remove_task_from_board: {
        Args: { p_task_id: string }
        Returns: undefined
      }
      kanban_save_filter: {
        Args: { p_filter: Json; p_name: string }
        Returns: string
      }
      kanban_set_board_grants: {
        Args: {
          p_board_id: string
          p_role_codes: string[]
          p_user_ids: string[]
        }
        Returns: undefined
      }
      kanban_set_columns: {
        Args: { p_board_id: string; p_columns: Json }
        Returns: undefined
      }
      kanban_set_task_tags: {
        Args: { p_names: string[]; p_task_id: string }
        Returns: undefined
      }
      kanban_set_workflow_step: {
        Args: { p_done: boolean; p_step_state_id: string }
        Returns: undefined
      }
      kanban_situacao_from_status: {
        Args: { p_status: Database["public"]["Enums"]["user_task_status"] }
        Returns: Database["public"]["Enums"]["task_situacao"]
      }
      kanban_stage_owner_role: {
        Args: { p_stage: Database["public"]["Enums"]["org_stage"] }
        Returns: string
      }
      kanban_start_workflow: {
        Args: { p_task_id: string; p_template_id: string }
        Returns: string
      }
      kanban_toggle_checklist_item: {
        Args: { p_done: boolean; p_item_id: string }
        Returns: undefined
      }
      kanban_toggle_favorite: { Args: { p_board_id: string }; Returns: boolean }
      kanban_update_board: {
        Args: {
          p_board_id: string
          p_hide_completed_after_days: number
          p_is_private: boolean
          p_name: string
          p_simplified_cards: boolean
        }
        Returns: undefined
      }
      list_users_for_inter_assistant: {
        Args: never
        Returns: {
          full_name: string
          has_assistant: boolean
          role_label: string
          user_id: string
        }[]
      }
      mcp_delete_server: { Args: { p_id: string }; Returns: undefined }
      mcp_register_server: {
        Args: {
          p_config?: Json
          p_description?: string
          p_enabled?: boolean
          p_name: string
          p_transport?: string
          p_url: string
        }
        Returns: string
      }
      mcp_set_server_enabled: {
        Args: { p_enabled: boolean; p_id: string }
        Returns: undefined
      }
      mcp_update_server_config: {
        Args: { p_config: Json; p_id: string }
        Returns: undefined
      }
      pode_operar_pendencia: {
        Args: {
          _task: Database["public"]["Tables"]["user_tasks"]["Row"]
          _user_id: string
        }
        Returns: boolean
      }
      provision_user_agents: {
        Args: { p_user_id: string }
        Returns: {
          agent_id: string
          display_name: string
          template_code: string
          was_created: boolean
        }[]
      }
      record_provider_spend: {
        Args: {
          p_cost_usd: number
          p_provider: string
          p_trace_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      refund_own_tokens: {
        Args: {
          p_amount: number
          p_description?: string
          p_reference_id: string
        }
        Returns: boolean
      }
      refund_tokens: {
        Args: {
          p_amount: number
          p_description?: string
          p_reference_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      register_provider_key: {
        Args: {
          p_api_key: string
          p_monthly_budget_usd?: number
          p_notes?: string
          p_provider: string
          p_set_default?: boolean
        }
        Returns: string
      }
      register_task_attachment: {
        Args: {
          p_description?: string
          p_file_name: string
          p_file_size_bytes: number
          p_mime_type?: string
          p_storage_path: string
          p_task_id: string
        }
        Returns: string
      }
      reprovision_all_missing: {
        Args: never
        Returns: {
          agentes_provisionados: number
          email: string
          full_name: string
          user_id: string
        }[]
      }
      resolver_pendencia: {
        Args: { p_id: string; p_resolucao?: string }
        Returns: string
      }
      start_agent_trace: {
        Args: {
          p_agent_id: string
          p_input_summary?: string
          p_metadata?: Json
          p_model?: string
          p_operation_name: string
          p_parent_span_id: string
          p_session_id: string
          p_span_id: string
          p_span_kind: string
          p_trace_id: string
        }
        Returns: string
      }
      start_chat_session: {
        Args: {
          p_client_id?: string
          p_entry_agent_id: string
          p_title?: string
        }
        Returns: string
      }
      transferir_pendencia: {
        Args: {
          p_departamento_destino?: Database["public"]["Enums"]["org_stage"]
          p_id: string
          p_responsavel_destino?: string
        }
        Returns: string
      }
      update_meeting: {
        Args: {
          p_id: string
          p_scheduled_date: string
          p_start_time: string
          p_end_time: string | null
          p_type: string | null
          p_lawyer_user_id: string | null
          p_receptionist_user_id: string | null
          p_client_id: string | null
          p_client_name: string | null
          p_phone: string | null
          p_summary: string | null
          p_notes: string | null
          p_status: Database["public"]["Enums"]["meeting_status"]
        }
        Returns: undefined
      }
      update_user_task_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["user_task_status"]
          p_notes?: string
          p_task_id: string
        }
        Returns: Database["public"]["Enums"]["user_task_status"]
      }
      validate_agent_for_chat: {
        Args: { p_agent_id: string }
        Returns: {
          agent_model: string
          agent_provider: string
          is_valid: boolean
          reason: string
        }[]
      }
      validate_user_task: {
        Args: { p_approve: boolean; p_notes?: string; p_task_id: string }
        Returns: Database["public"]["Enums"]["user_task_status"]
      }
    }
    Enums: {
      agent_role:
        | "ceo"
        | "assistant_root"
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
        | "tech"
      captacao_canal_tipo:
        | "cooperativa"
        | "ressaque"
        | "indicacao"
        | "site"
        | "outro"
      coverage_status: "scheduled" | "active" | "finished" | "cancelled"
      email_notification_status:
        | "pending"
        | "sending"
        | "sent"
        | "failed"
        | "skipped"
      email_notification_type:
        | "task_assigned"
        | "task_validation_required"
        | "task_validated"
        | "task_rejected"
        | "inter_assistant_received"
        | "inter_assistant_answered"
      inter_assistant_status:
        | "pending"
        | "in_progress"
        | "answered"
        | "denied"
        | "expired"
      lead_status:
        | "novo"
        | "em_contato"
        | "qualificado"
        | "convertido"
        | "perdido"
      meeting_status:
        | "scheduled"
        | "confirmed"
        | "rescheduled"
        | "canceled"
        | "no_show"
        | "done"
      legal_area:
        | "bancario"
        | "familia"
        | "plano_saude"
        | "consumidor"
        | "civil"
        | "previdenciario"
        | "tributario"
      org_stage:
        | "atendimento"
        | "confeccao"
        | "revisao"
        | "protocolo"
        | "audiencia"
        | "execucao"
        | "execucao_sindicato"
        | "recursos"
        | "recursos_criticos"
        | "alvara"
        | "diligencia"
        | "acompanhamento"
        | "financeiro"
        | "recepcao"
        | "recepcao_supervisionada"
        | "admin_equipe"
        | "captacao_cooperativa"
        | "kanban_pendencias"
        | "gestao"
        | "todas"
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
      provider_code:
        | "anthropic"
        | "openai"
        | "google"
        | "openrouter"
        | "deepseek"
      task_priority: "critical" | "high" | "medium" | "low"
      task_situacao:
        | "pendente"
        | "em_execucao"
        | "concluida_sucesso"
        | "concluida_sem_sucesso"
        | "cancelado"
      task_status:
        | "pending"
        | "in_progress"
        | "review"
        | "approved"
        | "rejected"
        | "completed"
        | "cancelled"
      token_transaction_type: "purchase" | "consumption" | "bonus" | "refund"
      user_task_status:
        | "draft"
        | "assigned"
        | "in_progress"
        | "awaiting_external"
        | "awaiting_validation"
        | "blocked"
        | "completed"
        | "cancelled"
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
        "ceo",
        "assistant_root",
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
        "tech",
      ],
      captacao_canal_tipo: [
        "cooperativa",
        "ressaque",
        "indicacao",
        "site",
        "outro",
      ],
      coverage_status: ["scheduled", "active", "finished", "cancelled"],
      email_notification_status: [
        "pending",
        "sending",
        "sent",
        "failed",
        "skipped",
      ],
      email_notification_type: [
        "task_assigned",
        "task_validation_required",
        "task_validated",
        "task_rejected",
        "inter_assistant_received",
        "inter_assistant_answered",
      ],
      inter_assistant_status: [
        "pending",
        "in_progress",
        "answered",
        "denied",
        "expired",
      ],
      lead_status: ["novo", "em_contato", "qualificado", "convertido", "perdido"],
      legal_area: [
        "bancario",
        "familia",
        "plano_saude",
        "consumidor",
        "civil",
        "previdenciario",
        "tributario",
      ],
      org_stage: [
        "atendimento",
        "confeccao",
        "revisao",
        "protocolo",
        "audiencia",
        "execucao",
        "execucao_sindicato",
        "recursos",
        "recursos_criticos",
        "alvara",
        "diligencia",
        "acompanhamento",
        "financeiro",
        "recepcao",
        "recepcao_supervisionada",
        "admin_equipe",
        "captacao_cooperativa",
        "kanban_pendencias",
        "gestao",
        "todas",
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
      provider_code: [
        "anthropic",
        "openai",
        "google",
        "openrouter",
        "deepseek",
      ],
      task_priority: ["critical", "high", "medium", "low"],
      task_situacao: [
        "pendente",
        "em_execucao",
        "concluida_sucesso",
        "concluida_sem_sucesso",
        "cancelado",
      ],
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
      user_task_status: [
        "draft",
        "assigned",
        "in_progress",
        "awaiting_external",
        "awaiting_validation",
        "blocked",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
