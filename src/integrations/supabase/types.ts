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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _stage_motor3: {
        Row: {
          payload: Json
        }
        Insert: {
          payload: Json
        }
        Update: {
          payload?: Json
        }
        Relationships: []
      }
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
      ai_generations: {
        Row: {
          agent_id: string | null
          cached_input_tokens: number
          cost_usd: number | null
          created_at: string
          error_type: string | null
          finish_reason: string | null
          id: string
          input_price_per_mtok: number | null
          input_tokens: number
          is_tech_test: boolean
          latency_ms: number | null
          model: string | null
          model_id_resolved: string | null
          output_price_per_mtok: number | null
          output_tokens: number
          provider: string | null
          reasoning_tokens: number
          run_id: string | null
          session_id: string | null
          source: string
          stage: string | null
          status: string
          ttft_ms: number | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          cached_input_tokens?: number
          cost_usd?: number | null
          created_at?: string
          error_type?: string | null
          finish_reason?: string | null
          id?: string
          input_price_per_mtok?: number | null
          input_tokens?: number
          is_tech_test?: boolean
          latency_ms?: number | null
          model?: string | null
          model_id_resolved?: string | null
          output_price_per_mtok?: number | null
          output_tokens?: number
          provider?: string | null
          reasoning_tokens?: number
          run_id?: string | null
          session_id?: string | null
          source?: string
          stage?: string | null
          status?: string
          ttft_ms?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          cached_input_tokens?: number
          cost_usd?: number | null
          created_at?: string
          error_type?: string | null
          finish_reason?: string | null
          id?: string
          input_price_per_mtok?: number | null
          input_tokens?: number
          is_tech_test?: boolean
          latency_ms?: number | null
          model?: string | null
          model_id_resolved?: string | null
          output_price_per_mtok?: number | null
          output_tokens?: number
          provider?: string | null
          reasoning_tokens?: number
          run_id?: string | null
          session_id?: string | null
          source?: string
          stage?: string | null
          status?: string
          ttft_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      apolices_seguro: {
        Row: {
          cancelada_em: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          is_test: boolean | null
          notes: string | null
          numero_apolice: string | null
          numero_processo_susep: string | null
          origem_desconto: string | null
          premio_periodicidade: string | null
          premio_valor: number | null
          process_id: string | null
          produto: string | null
          reconhecida: boolean | null
          restituicao_valor: number | null
          seguradora: string
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          cancelada_em?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_test?: boolean | null
          notes?: string | null
          numero_apolice?: string | null
          numero_processo_susep?: string | null
          origem_desconto?: string | null
          premio_periodicidade?: string | null
          premio_valor?: number | null
          process_id?: string | null
          produto?: string | null
          reconhecida?: boolean | null
          restituicao_valor?: number | null
          seguradora: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          cancelada_em?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_test?: boolean | null
          notes?: string | null
          numero_apolice?: string | null
          numero_processo_susep?: string | null
          origem_desconto?: string | null
          premio_periodicidade?: string | null
          premio_valor?: number | null
          process_id?: string | null
          produto?: string | null
          reconhecida?: boolean | null
          restituicao_valor?: number | null
          seguradora?: string
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apolices_seguro_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apolices_seguro_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apolices_seguro_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      area_advogado_responsavel: {
        Row: {
          area: Database["public"]["Enums"]["legal_area"]
          responsible_user_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area: Database["public"]["Enums"]["legal_area"]
          responsible_user_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area?: Database["public"]["Enums"]["legal_area"]
          responsible_user_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audiencia_lembretes: {
        Row: {
          audiencia_id: string
          canal: string
          created_at: string
          data_prevista: string
          feito_em: string | null
          feito_por: string | null
          id: string
          observacao: string | null
          pendencia_task_id: string | null
          status: string
        }
        Insert: {
          audiencia_id: string
          canal?: string
          created_at?: string
          data_prevista: string
          feito_em?: string | null
          feito_por?: string | null
          id?: string
          observacao?: string | null
          pendencia_task_id?: string | null
          status?: string
        }
        Update: {
          audiencia_id?: string
          canal?: string
          created_at?: string
          data_prevista?: string
          feito_em?: string | null
          feito_por?: string | null
          id?: string
          observacao?: string | null
          pendencia_task_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiencia_lembretes_audiencia_id_fkey"
            columns: ["audiencia_id"]
            isOneToOne: false
            referencedRelation: "audiencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencia_lembretes_pendencia_task_id_fkey"
            columns: ["pendencia_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audiencias: {
        Row: {
          advogado_nome: string | null
          advogado_user_id: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          data_captura: string | null
          data_hora: string
          docs: Json
          google_calendar_id: string | null
          google_event_id: string | null
          google_sync_status: string | null
          id: string
          is_test: boolean
          last_synced_at: string | null
          link_local: string | null
          observacoes: string | null
          origem: string
          parte_contraria: string | null
          process_id: string | null
          process_number: string | null
          status: Database["public"]["Enums"]["audiencia_status"]
          tipo_acao: string | null
          updated_at: string
        }
        Insert: {
          advogado_nome?: string | null
          advogado_user_id?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          data_captura?: string | null
          data_hora: string
          docs?: Json
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_status?: string | null
          id?: string
          is_test?: boolean
          last_synced_at?: string | null
          link_local?: string | null
          observacoes?: string | null
          origem?: string
          parte_contraria?: string | null
          process_id?: string | null
          process_number?: string | null
          status?: Database["public"]["Enums"]["audiencia_status"]
          tipo_acao?: string | null
          updated_at?: string
        }
        Update: {
          advogado_nome?: string | null
          advogado_user_id?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          data_captura?: string | null
          data_hora?: string
          docs?: Json
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_status?: string | null
          id?: string
          is_test?: boolean
          last_synced_at?: string | null
          link_local?: string | null
          observacoes?: string | null
          origem?: string
          parte_contraria?: string | null
          process_id?: string | null
          process_number?: string | null
          status?: Database["public"]["Enums"]["audiencia_status"]
          tipo_acao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiencias_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiencias_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
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
      business_hours_config: {
        Row: {
          close_time: string
          id: boolean
          max_parallel: number
          open_time: string
          slot_minutes: number
          timezone: string
          updated_at: string
          updated_by: string | null
          windows: Json
          workdays: number[]
        }
        Insert: {
          close_time?: string
          id?: boolean
          max_parallel?: number
          open_time?: string
          slot_minutes?: number
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          windows?: Json
          workdays?: number[]
        }
        Update: {
          close_time?: string
          id?: boolean
          max_parallel?: number
          open_time?: string
          slot_minutes?: number
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          windows?: Json
          workdays?: number[]
        }
        Relationships: []
      }
      campanha_itens: {
        Row: {
          campanha_id: string
          client_id: string
          id: string
          observacao: string | null
          status: string
          tentativas: number
          ultima_tentativa: string | null
        }
        Insert: {
          campanha_id: string
          client_id: string
          id?: string
          observacao?: string | null
          status?: string
          tentativas?: number
          ultima_tentativa?: string | null
        }
        Update: {
          campanha_id?: string
          client_id?: string
          id?: string
          observacao?: string | null
          status?: string
          tentativas?: number
          ultima_tentativa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_itens_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_itens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_itens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          created_at: string
          created_by: string | null
          filtro: Json
          id: string
          nome: string
          objetivo: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filtro?: Json
          id?: string
          nome: string
          objetivo: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filtro?: Json
          id?: string
          nome?: string
          objetivo?: string
          status?: string
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
          ocr_confidence: number | null
          ocr_engine: string | null
          ocr_fields: Json | null
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
          ocr_confidence?: number | null
          ocr_engine?: string | null
          ocr_fields?: Json | null
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
          ocr_confidence?: number | null
          ocr_engine?: string | null
          ocr_fields?: Json | null
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
          acting_as_user_id: string | null
          client_id: string | null
          closed_at: string | null
          created_at: string | null
          entry_agent_id: string | null
          id: string
          is_tech_test: boolean
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
          acting_as_user_id?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_agent_id?: string | null
          id?: string
          is_tech_test?: boolean
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
          acting_as_user_id?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          entry_agent_id?: string | null
          id?: string
          is_tech_test?: boolean
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
            foreignKeyName: "chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
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
      client_bank_relations: {
        Row: {
          banco: string
          client_id: string
          contrato_em_posse: boolean
          created_at: string
          created_by: string | null
          extrato_ano: number | null
          extrato_em_posse: boolean
          id: string
          notes: string | null
          reconhece: boolean | null
          tipo_relacao: string
          updated_at: string
        }
        Insert: {
          banco: string
          client_id: string
          contrato_em_posse?: boolean
          created_at?: string
          created_by?: string | null
          extrato_ano?: number | null
          extrato_em_posse?: boolean
          id?: string
          notes?: string | null
          reconhece?: boolean | null
          tipo_relacao: string
          updated_at?: string
        }
        Update: {
          banco?: string
          client_id?: string
          contrato_em_posse?: boolean
          created_at?: string
          created_by?: string | null
          extrato_ano?: number | null
          extrato_em_posse?: boolean
          id?: string
          notes?: string | null
          reconhece?: boolean | null
          tipo_relacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_bank_relations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_bank_relations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
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
          is_test: boolean
          mime_type: string | null
          notes: string | null
          origem: string | null
          status: string
          task_id: string | null
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
          is_test?: boolean
          mime_type?: string | null
          notes?: string | null
          origem?: string | null
          status?: string
          task_id?: string | null
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
          is_test?: boolean
          mime_type?: string | null
          notes?: string | null
          origem?: string | null
          status?: string
          task_id?: string | null
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
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_gov_credentials: {
        Row: {
          client_id: string
          codigo_2fa_temporario: string | null
          consentimento_em: string | null
          consentimento_registrado: boolean
          consentimento_versao: string | null
          created_at: string
          created_by: string | null
          gov_senha_enc: string | null
          gov_usuario_enc: string | null
          id: string
          status_acesso: string | null
          tem_2fa: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          codigo_2fa_temporario?: string | null
          consentimento_em?: string | null
          consentimento_registrado?: boolean
          consentimento_versao?: string | null
          created_at?: string
          created_by?: string | null
          gov_senha_enc?: string | null
          gov_usuario_enc?: string | null
          id?: string
          status_acesso?: string | null
          tem_2fa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          codigo_2fa_temporario?: string | null
          consentimento_em?: string | null
          consentimento_registrado?: boolean
          consentimento_versao?: string | null
          created_at?: string
          created_by?: string | null
          gov_senha_enc?: string | null
          gov_usuario_enc?: string | null
          id?: string
          status_acesso?: string | null
          tem_2fa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_gov_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_gov_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      client_saved_filters: {
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
          user_id?: string
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
      client_update_log: {
        Row: {
          changed_by: string
          changes: Json
          client_id: string
          created_at: string
          id: string
        }
        Insert: {
          changed_by: string
          changes: Json
          client_id: string
          created_at?: string
          id?: string
        }
        Update: {
          changed_by?: string
          changes?: Json
          client_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_update_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_update_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          address_complement: string | null
          address_number: string | null
          banco_beneficio: string | null
          bank_account: string | null
          bank_account_enc: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_agency_enc: string | null
          bank_name: string | null
          birth_date: string | null
          city: string | null
          client_origin: string | null
          cnpj: string | null
          cnpj_bidx: string | null
          cnpj_enc: string | null
          country: string | null
          cpf: string | null
          cpf_bidx: string | null
          cpf_enc: string | null
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
          ie_enc: string | null
          im: string | null
          im_enc: string | null
          is_test: boolean
          legal_rep_cpf: string | null
          legal_rep_cpf_enc: string | null
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
          phone_commercial_is_whatsapp: boolean
          phone_home: string | null
          phone_home_is_whatsapp: boolean
          phone_is_whatsapp: boolean
          pis_nit: string | null
          pis_nit_enc: string | null
          pix_key: string | null
          pix_key_enc: string | null
          pix_key_type: string | null
          profession: string | null
          responsible_lawyer_id: string | null
          rg: string | null
          rg_enc: string | null
          rg_issuer: string | null
          rg_uf: string | null
          state: string | null
          status: string
          status_atendimento: string | null
          status_comercial: string | null
          status_documental: string | null
          status_juridico: string | null
          status_processo: string | null
          tipo_pessoa: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          banco_beneficio?: string | null
          bank_account?: string | null
          bank_account_enc?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_agency_enc?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          client_origin?: string | null
          cnpj?: string | null
          cnpj_bidx?: string | null
          cnpj_enc?: string | null
          country?: string | null
          cpf?: string | null
          cpf_bidx?: string | null
          cpf_enc?: string | null
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
          ie_enc?: string | null
          im?: string | null
          im_enc?: string | null
          is_test?: boolean
          legal_rep_cpf?: string | null
          legal_rep_cpf_enc?: string | null
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
          phone_commercial_is_whatsapp?: boolean
          phone_home?: string | null
          phone_home_is_whatsapp?: boolean
          phone_is_whatsapp?: boolean
          pis_nit?: string | null
          pis_nit_enc?: string | null
          pix_key?: string | null
          pix_key_enc?: string | null
          pix_key_type?: string | null
          profession?: string | null
          responsible_lawyer_id?: string | null
          rg?: string | null
          rg_enc?: string | null
          rg_issuer?: string | null
          rg_uf?: string | null
          state?: string | null
          status?: string
          status_atendimento?: string | null
          status_comercial?: string | null
          status_documental?: string | null
          status_juridico?: string | null
          status_processo?: string | null
          tipo_pessoa?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          banco_beneficio?: string | null
          bank_account?: string | null
          bank_account_enc?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_agency_enc?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          client_origin?: string | null
          cnpj?: string | null
          cnpj_bidx?: string | null
          cnpj_enc?: string | null
          country?: string | null
          cpf?: string | null
          cpf_bidx?: string | null
          cpf_enc?: string | null
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
          ie_enc?: string | null
          im?: string | null
          im_enc?: string | null
          is_test?: boolean
          legal_rep_cpf?: string | null
          legal_rep_cpf_enc?: string | null
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
          phone_commercial_is_whatsapp?: boolean
          phone_home?: string | null
          phone_home_is_whatsapp?: boolean
          phone_is_whatsapp?: boolean
          pis_nit?: string | null
          pis_nit_enc?: string | null
          pix_key?: string | null
          pix_key_enc?: string | null
          pix_key_type?: string | null
          profession?: string | null
          responsible_lawyer_id?: string | null
          rg?: string | null
          rg_enc?: string | null
          rg_issuer?: string | null
          rg_uf?: string | null
          state?: string | null
          status?: string
          status_atendimento?: string | null
          status_comercial?: string | null
          status_documental?: string | null
          status_juridico?: string | null
          status_processo?: string | null
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
      data_review_log: {
        Row: {
          campo: string
          client_id: string | null
          criado_em: string
          id: string
          motivo: string
          valor_novo: string | null
          valor_original: string | null
        }
        Insert: {
          campo: string
          client_id?: string | null
          criado_em?: string
          id?: string
          motivo: string
          valor_novo?: string | null
          valor_original?: string | null
        }
        Update: {
          campo?: string
          client_id?: string | null
          criado_em?: string
          id?: string
          motivo?: string
          valor_novo?: string | null
          valor_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_review_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_review_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
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
      diligencias: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          cumprida_em: string | null
          descricao: string
          diligencia_origem_id: string | null
          id: string
          is_test: boolean | null
          notes: string | null
          pendencia_task_id: string | null
          prazo: string | null
          process_id: string | null
          process_numero_texto: string | null
          protocolo: string | null
          responsavel_nome: string | null
          responsavel_user_id: string | null
          resultado: string | null
          status: string
          tipo: string
          updated_at: string
          vara: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          cumprida_em?: string | null
          descricao: string
          diligencia_origem_id?: string | null
          id?: string
          is_test?: boolean | null
          notes?: string | null
          pendencia_task_id?: string | null
          prazo?: string | null
          process_id?: string | null
          process_numero_texto?: string | null
          protocolo?: string | null
          responsavel_nome?: string | null
          responsavel_user_id?: string | null
          resultado?: string | null
          status?: string
          tipo: string
          updated_at?: string
          vara?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          cumprida_em?: string | null
          descricao?: string
          diligencia_origem_id?: string | null
          id?: string
          is_test?: boolean | null
          notes?: string | null
          pendencia_task_id?: string | null
          prazo?: string | null
          process_id?: string | null
          process_numero_texto?: string | null
          protocolo?: string | null
          responsavel_nome?: string | null
          responsavel_user_id?: string | null
          resultado?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          vara?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diligencias_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligencias_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligencias_diligencia_origem_id_fkey"
            columns: ["diligencia_origem_id"]
            isOneToOne: false
            referencedRelation: "diligencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligencias_pendencia_task_id_fkey"
            columns: ["pendencia_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligencias_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
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
      execucao_eventos: {
        Row: {
          created_at: string
          created_by: string | null
          execucao_id: string
          fase_de: string | null
          fase_para: string
          id: string
          observacao: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          execucao_id: string
          fase_de?: string | null
          fase_para: string
          id?: string
          observacao?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          execucao_id?: string
          fase_de?: string | null
          fase_para?: string
          id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucao_eventos_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes: {
        Row: {
          created_at: string
          created_by: string | null
          fase: string
          id: string
          is_test: boolean | null
          notes: string | null
          process_id: string
          proxima_revisao: string | null
          responsavel_nome: string | null
          responsavel_user_id: string | null
          reu_nome: string | null
          reu_tipo: string | null
          revisao_intervalo_dias: number | null
          updated_at: string
          valor_execucao: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fase?: string
          id?: string
          is_test?: boolean | null
          notes?: string | null
          process_id: string
          proxima_revisao?: string | null
          responsavel_nome?: string | null
          responsavel_user_id?: string | null
          reu_nome?: string | null
          reu_tipo?: string | null
          revisao_intervalo_dias?: number | null
          updated_at?: string
          valor_execucao?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fase?: string
          id?: string
          is_test?: boolean | null
          notes?: string | null
          process_id?: string
          proxima_revisao?: string | null
          responsavel_nome?: string | null
          responsavel_user_id?: string | null
          reu_nome?: string | null
          reu_tipo?: string | null
          revisao_intervalo_dias?: number | null
          updated_at?: string
          valor_execucao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "execucoes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: true
            referencedRelation: "processes"
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
      extrato_analises: {
        Row: {
          banco: string
          client_document_id: string | null
          client_id: string
          created_at: string
          criado_por: string | null
          custo_usd: number | null
          erro_mensagem: string | null
          id: string
          is_test: boolean | null
          modelo: string | null
          notes: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          revisado_em: string | null
          revisado_por: string | null
          status: string
          updated_at: string
        }
        Insert: {
          banco: string
          client_document_id?: string | null
          client_id: string
          created_at?: string
          criado_por?: string | null
          custo_usd?: number | null
          erro_mensagem?: string | null
          id?: string
          is_test?: boolean | null
          modelo?: string | null
          notes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          banco?: string
          client_document_id?: string | null
          client_id?: string
          created_at?: string
          criado_por?: string | null
          custo_usd?: number | null
          erro_mensagem?: string | null
          id?: string
          is_test?: boolean | null
          modelo?: string | null
          notes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extrato_analises_client_document_id_fkey"
            columns: ["client_document_id"]
            isOneToOne: false
            referencedRelation: "client_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_analises_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_analises_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_categoria_tese: {
        Row: {
          categoria: string
          observacao: string | null
          rotulo_planilha: string
          tipo_acao_id: string | null
        }
        Insert: {
          categoria: string
          observacao?: string | null
          rotulo_planilha: string
          tipo_acao_id?: string | null
        }
        Update: {
          categoria?: string
          observacao?: string | null
          rotulo_planilha?: string
          tipo_acao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extrato_categoria_tese_tipo_acao_id_fkey"
            columns: ["tipo_acao_id"]
            isOneToOne: false
            referencedRelation: "tipos_acao"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_gabarito: {
        Row: {
          banco: string
          categoria: string
          client_id: string | null
          client_name: string
          client_name_fold: string
          created_at: string
          detalhe: string | null
          fonte: string | null
          id: string
          marcado: boolean
          trouxe_extrato: boolean | null
        }
        Insert: {
          banco?: string
          categoria: string
          client_id?: string | null
          client_name: string
          client_name_fold: string
          created_at?: string
          detalhe?: string | null
          fonte?: string | null
          id?: string
          marcado: boolean
          trouxe_extrato?: boolean | null
        }
        Update: {
          banco?: string
          categoria?: string
          client_id?: string | null
          client_name?: string
          client_name_fold?: string
          created_at?: string
          detalhe?: string | null
          fonte?: string | null
          id?: string
          marcado?: boolean
          trouxe_extrato?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "extrato_gabarito_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_gabarito_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_lancamentos: {
        Row: {
          analise_id: string
          categoria: string
          confianca: number | null
          created_at: string
          data_lancamento: string | null
          decidido_em: string | null
          decidido_por: string | null
          decisao: string
          descricao_original: string
          id: string
          justificativa: string | null
          observacao: string | null
          valor: number | null
        }
        Insert: {
          analise_id: string
          categoria: string
          confianca?: number | null
          created_at?: string
          data_lancamento?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string
          descricao_original: string
          id?: string
          justificativa?: string | null
          observacao?: string | null
          valor?: number | null
        }
        Update: {
          analise_id?: string
          categoria?: string
          confianca?: number | null
          created_at?: string
          data_lancamento?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string
          descricao_original?: string
          id?: string
          justificativa?: string | null
          observacao?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "extrato_lancamentos_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "extrato_analises"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados_forenses: {
        Row: {
          abrangencia: string
          confirmado: boolean
          created_at: string
          data: string
          descricao: string
          fonte: string | null
          tipo: string
        }
        Insert: {
          abrangencia: string
          confirmado?: boolean
          created_at?: string
          data: string
          descricao: string
          fonte?: string | null
          tipo?: string
        }
        Update: {
          abrangencia?: string
          confirmado?: boolean
          created_at?: string
          data?: string
          descricao?: string
          fonte?: string | null
          tipo?: string
        }
        Relationships: []
      }
      google_calendar_config: {
        Row: {
          account_email: string | null
          calendar_id: string | null
          id: boolean
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          account_email?: string | null
          calendar_id?: string | null
          id?: boolean
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          account_email?: string | null
          calendar_id?: string | null
          id?: boolean
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: []
      }
      gov_credential_access_log: {
        Row: {
          accessed_at: string
          accessed_by: string
          client_id: string
          id: string
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          client_id: string
          id?: string
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          client_id?: string
          id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          day: string
          label: string
        }
        Insert: {
          day: string
          label?: string
        }
        Update: {
          day?: string
          label?: string
        }
        Relationships: []
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
      kanban_board_config: {
        Row: {
          board_id: string
          created_at: string
          criticidade: Json
          id: string
          prazo_dias: number | null
          responsavel_user_id: string | null
          updated_at: string
        }
        Insert: {
          board_id: string
          created_at?: string
          criticidade?: Json
          id?: string
          prazo_dias?: number | null
          responsavel_user_id?: string | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          created_at?: string
          criticidade?: Json
          id?: string
          prazo_dias?: number | null
          responsavel_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_board_config_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: true
            referencedRelation: "kanban_boards"
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
          tipo_acao_id: string | null
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
          tipo_acao_id?: string | null
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
          tipo_acao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_boards_tipo_acao_id_fkey"
            columns: ["tipo_acao_id"]
            isOneToOne: false
            referencedRelation: "tipos_acao"
            referencedColumns: ["id"]
          },
        ]
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
      ligacoes: {
        Row: {
          campanha_id: string | null
          client_id: string
          created_at: string
          id: string
          observacao: string | null
          operador_user_id: string
          resultado: string
        }
        Insert: {
          campanha_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          operador_user_id: string
          resultado: string
        }
        Update: {
          campanha_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          operador_user_id?: string
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "ligacoes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ligacoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ligacoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
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
      meeting_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          field: string
          id: string
          meeting_id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          field: string
          id?: string
          meeting_id: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          field?: string
          id?: string
          meeting_id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_audit_log_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          google_sync_status: string | null
          id: string
          last_synced_at: string | null
          lawyer_user_id: string | null
          notes: string | null
          phone: string | null
          receptionist_user_id: string | null
          reminder_sent_at: string | null
          scheduled_date: string
          start_time: string
          status: Database["public"]["Enums"]["meeting_status"]
          summary: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_status?: string | null
          id?: string
          last_synced_at?: string | null
          lawyer_user_id?: string | null
          notes?: string | null
          phone?: string | null
          receptionist_user_id?: string | null
          reminder_sent_at?: string | null
          scheduled_date: string
          start_time: string
          status?: Database["public"]["Enums"]["meeting_status"]
          summary?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_sync_status?: string | null
          id?: string
          last_synced_at?: string | null
          lawyer_user_id?: string | null
          notes?: string | null
          phone?: string | null
          receptionist_user_id?: string | null
          reminder_sent_at?: string | null
          scheduled_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          summary?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
        ]
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
      notifications: {
        Row: {
          actor_user_id: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          route: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          route?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          route?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orchestration_runs: {
        Row: {
          acao_tipo: string | null
          block_index: number
          blocks: Json
          cancel_requested: boolean
          chain: Json
          created_at: string
          delegation_stack: Json | null
          draft: string | null
          entry_agent_id: string | null
          error: string | null
          feedback: string | null
          fixed_facts: string | null
          id: string
          intent_category: string | null
          iterations: number
          mech_report: Json | null
          n3_usage: Json | null
          original_message: string
          pending_actions: Json | null
          route_path: string | null
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
          cancel_requested?: boolean
          chain?: Json
          created_at?: string
          delegation_stack?: Json | null
          draft?: string | null
          entry_agent_id?: string | null
          error?: string | null
          feedback?: string | null
          fixed_facts?: string | null
          id?: string
          intent_category?: string | null
          iterations?: number
          mech_report?: Json | null
          n3_usage?: Json | null
          original_message: string
          pending_actions?: Json | null
          route_path?: string | null
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
          cancel_requested?: boolean
          chain?: Json
          created_at?: string
          delegation_stack?: Json | null
          draft?: string | null
          entry_agent_id?: string | null
          error?: string | null
          feedback?: string | null
          fixed_facts?: string | null
          id?: string
          intent_category?: string | null
          iterations?: number
          mech_report?: Json | null
          n3_usage?: Json | null
          original_message?: string
          pending_actions?: Json | null
          route_path?: string | null
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
          client_id: string | null
          client_name: string
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          is_test: boolean
          next_hearing_date: string | null
          process_number: string | null
          responsible_lawyer: string | null
          responsible_lawyer_user_id: string | null
          status: string
          tipo_acao_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          client_name: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_test?: boolean
          next_hearing_date?: string | null
          process_number?: string | null
          responsible_lawyer?: string | null
          responsible_lawyer_user_id?: string | null
          status?: string
          tipo_acao_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          client_name?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          is_test?: boolean
          next_hearing_date?: string | null
          process_number?: string | null
          responsible_lawyer?: string | null
          responsible_lawyer_user_id?: string | null
          status?: string
          tipo_acao_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_tipo_acao_id_fkey"
            columns: ["tipo_acao_id"]
            isOneToOne: false
            referencedRelation: "tipos_acao"
            referencedColumns: ["id"]
          },
        ]
      }
      procuracoes: {
        Row: {
          client_document_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          data_assinatura: string
          id: string
          is_test: boolean | null
          notes: string | null
          pendencia_task_id: string | null
          status: string
          substituida_por_id: string | null
          tipo: string
          updated_at: string
          validade_ate: string
          validade_meses: number
        }
        Insert: {
          client_document_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          data_assinatura: string
          id?: string
          is_test?: boolean | null
          notes?: string | null
          pendencia_task_id?: string | null
          status?: string
          substituida_por_id?: string | null
          tipo?: string
          updated_at?: string
          validade_ate: string
          validade_meses?: number
        }
        Update: {
          client_document_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          data_assinatura?: string
          id?: string
          is_test?: boolean | null
          notes?: string | null
          pendencia_task_id?: string | null
          status?: string
          substituida_por_id?: string | null
          tipo?: string
          updated_at?: string
          validade_ate?: string
          validade_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "procuracoes_client_document_id_fkey"
            columns: ["client_document_id"]
            isOneToOne: false
            referencedRelation: "client_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procuracoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procuracoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procuracoes_pendencia_task_id_fkey"
            columns: ["pendencia_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procuracoes_substituida_por_id_fkey"
            columns: ["substituida_por_id"]
            isOneToOne: false
            referencedRelation: "procuracoes"
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
      provider_budgets: {
        Row: {
          budget_start: string
          budget_usd: number
          notes: string | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          budget_start?: string
          budget_usd: number
          notes?: string | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          budget_start?: string
          budget_usd?: number
          notes?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      provider_credit_snapshots: {
        Row: {
          credits_remaining: number | null
          credits_total: number | null
          credits_used: number | null
          currency: string | null
          error_msg: string | null
          fetched_at: string
          id: string
          kind: string
          provider: string
          raw: Json | null
          status: string
        }
        Insert: {
          credits_remaining?: number | null
          credits_total?: number | null
          credits_used?: number | null
          currency?: string | null
          error_msg?: string | null
          fetched_at?: string
          id?: string
          kind?: string
          provider: string
          raw?: Json | null
          status?: string
        }
        Update: {
          credits_remaining?: number | null
          credits_total?: number | null
          credits_used?: number | null
          currency?: string | null
          error_msg?: string | null
          fetched_at?: string
          id?: string
          kind?: string
          provider?: string
          raw?: Json | null
          status?: string
        }
        Relationships: []
      }
      reclamacoes_administrativas: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          data_reclamacao: string
          desfecho: string
          id: string
          is_test: boolean | null
          notes: string | null
          orgao: string
          orgao_descricao: string | null
          prazo_fatal: string | null
          prazo_resposta: string | null
          process_id: string | null
          protocolo: string | null
          resposta_em: string | null
          resposta_texto: string | null
          tese: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          data_reclamacao?: string
          desfecho?: string
          id?: string
          is_test?: boolean | null
          notes?: string | null
          orgao: string
          orgao_descricao?: string | null
          prazo_fatal?: string | null
          prazo_resposta?: string | null
          process_id?: string | null
          protocolo?: string | null
          resposta_em?: string | null
          resposta_texto?: string | null
          tese?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          data_reclamacao?: string
          desfecho?: string
          id?: string
          is_test?: boolean | null
          notes?: string | null
          orgao?: string
          orgao_descricao?: string | null
          prazo_fatal?: string | null
          prazo_resposta?: string | null
          process_id?: string | null
          protocolo?: string | null
          resposta_em?: string | null
          resposta_texto?: string | null
          tese?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reclamacoes_administrativas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamacoes_administrativas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reclamacoes_administrativas_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      required_document_sets: {
        Row: {
          created_at: string
          document_type: string
          id: string
          required: boolean
          set_code: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          required?: boolean
          set_code: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          required?: boolean
          set_code?: string
          sort_order?: number
        }
        Relationships: []
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
      sistema_flags: {
        Row: {
          ativo: boolean
          chave: string
          descricao: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          chave: string
          descricao?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          chave?: string
          descricao?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      task_approval_log: {
        Row: {
          aceite: boolean
          created_at: string
          decided_by: string
          decisao: string
          id: string
          observacoes: string | null
          user_task_id: string
        }
        Insert: {
          aceite?: boolean
          created_at?: string
          decided_by: string
          decisao: string
          id?: string
          observacoes?: string | null
          user_task_id: string
        }
        Update: {
          aceite?: boolean
          created_at?: string
          decided_by?: string
          decisao?: string
          id?: string
          observacoes?: string | null
          user_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_approval_log_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: false
            referencedRelation: "user_tasks"
            referencedColumns: ["id"]
          },
        ]
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
      tipo_acao_ancora_docs: {
        Row: {
          document_types: string[]
          observacao: string | null
          tipo_acao_id: string
          updated_at: string
        }
        Insert: {
          document_types: string[]
          observacao?: string | null
          tipo_acao_id: string
          updated_at?: string
        }
        Update: {
          document_types?: string[]
          observacao?: string | null
          tipo_acao_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_acao_ancora_docs_tipo_acao_id_fkey"
            columns: ["tipo_acao_id"]
            isOneToOne: true
            referencedRelation: "tipos_acao"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_acao_apelidos: {
        Row: {
          apelido_fold: string
          apelido_original: string
          created_at: string
          fonte: string | null
          tipo_acao_id: string
        }
        Insert: {
          apelido_fold: string
          apelido_original: string
          created_at?: string
          fonte?: string | null
          tipo_acao_id: string
        }
        Update: {
          apelido_fold?: string
          apelido_original?: string
          created_at?: string
          fonte?: string | null
          tipo_acao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_acao_apelidos_tipo_acao_id_fkey"
            columns: ["tipo_acao_id"]
            isOneToOne: false
            referencedRelation: "tipos_acao"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_acao_documentos: {
        Row: {
          created_at: string
          created_by: string | null
          document_type: string
          fonte: string | null
          id: string
          obrigatoriedade: string
          observacao: string | null
          ordem: number | null
          tipo_acao_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_type: string
          fonte?: string | null
          id?: string
          obrigatoriedade?: string
          observacao?: string | null
          ordem?: number | null
          tipo_acao_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_type?: string
          fonte?: string | null
          id?: string
          obrigatoriedade?: string
          observacao?: string | null
          ordem?: number | null
          tipo_acao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipo_acao_documentos_tipo_acao_id_fkey"
            columns: ["tipo_acao_id"]
            isOneToOne: false
            referencedRelation: "tipos_acao"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_acao: {
        Row: {
          ativo: boolean
          categoria: string
          code: string
          created_at: string
          default_task_type_id: string | null
          exige_procuracao_vigente: boolean
          exige_reclamacao_previa: boolean
          id: string
          nome: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          code: string
          created_at?: string
          default_task_type_id?: string | null
          exige_procuracao_vigente?: boolean
          exige_reclamacao_previa?: boolean
          id?: string
          nome: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          code?: string
          created_at?: string
          default_task_type_id?: string | null
          exige_procuracao_vigente?: boolean
          exige_reclamacao_previa?: boolean
          id?: string
          nome?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_acao_default_task_type_id_fkey"
            columns: ["default_task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
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
      user_menu_permissions: {
        Row: {
          granted: boolean
          granted_by: string | null
          menu_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          granted: boolean
          granted_by?: string | null
          menu_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          granted?: boolean
          granted_by?: string | null
          menu_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence_heartbeat: {
        Row: {
          last_seen_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
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
          is_test: boolean
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
          is_test?: boolean
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
          is_test?: boolean
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
            foreignKeyName: "user_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
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
      clients_decrypted: {
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
          cpf_bidx: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          fantasy_name: string | null
          father_name: string | null
          foundation_date: string | null
          full_name: string | null
          gender: string | null
          gov_br_profile: string | null
          id: string | null
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
          phone_commercial_is_whatsapp: boolean | null
          phone_home: string | null
          phone_home_is_whatsapp: boolean | null
          phone_is_whatsapp: boolean | null
          pis_nit: string | null
          pix_key: string | null
          pix_key_type: string | null
          profession: string | null
          responsible_lawyer_id: string | null
          rg: string | null
          rg_issuer: string | null
          rg_uf: string | null
          state: string | null
          status: string | null
          status_atendimento: string | null
          status_comercial: string | null
          status_documental: string | null
          status_juridico: string | null
          status_processo: string | null
          tipo_pessoa: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          bank_account?: never
          bank_account_type?: string | null
          bank_agency?: never
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          client_origin?: string | null
          cnpj?: never
          country?: string | null
          cpf?: never
          cpf_bidx?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          fantasy_name?: string | null
          father_name?: string | null
          foundation_date?: string | null
          full_name?: string | null
          gender?: string | null
          gov_br_profile?: string | null
          id?: string | null
          ie?: never
          im?: never
          legal_rep_cpf?: never
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
          phone_commercial_is_whatsapp?: boolean | null
          phone_home?: string | null
          phone_home_is_whatsapp?: boolean | null
          phone_is_whatsapp?: boolean | null
          pis_nit?: never
          pix_key?: never
          pix_key_type?: string | null
          profession?: string | null
          responsible_lawyer_id?: string | null
          rg?: never
          rg_issuer?: string | null
          rg_uf?: string | null
          state?: string | null
          status?: string | null
          status_atendimento?: string | null
          status_comercial?: string | null
          status_documental?: string | null
          status_juridico?: string | null
          status_processo?: string | null
          tipo_pessoa?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          address_number?: string | null
          bank_account?: never
          bank_account_type?: string | null
          bank_agency?: never
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          client_origin?: string | null
          cnpj?: never
          country?: string | null
          cpf?: never
          cpf_bidx?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          fantasy_name?: string | null
          father_name?: string | null
          foundation_date?: string | null
          full_name?: string | null
          gender?: string | null
          gov_br_profile?: string | null
          id?: string | null
          ie?: never
          im?: never
          legal_rep_cpf?: never
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
          phone_commercial_is_whatsapp?: boolean | null
          phone_home?: string | null
          phone_home_is_whatsapp?: boolean | null
          phone_is_whatsapp?: boolean | null
          pis_nit?: never
          pix_key?: never
          pix_key_type?: string | null
          profession?: string | null
          responsible_lawyer_id?: string | null
          rg?: never
          rg_issuer?: string | null
          rg_uf?: string | null
          state?: string | null
          status?: string | null
          status_atendimento?: string | null
          status_comercial?: string | null
          status_documental?: string | null
          status_juridico?: string | null
          status_processo?: string | null
          tipo_pessoa?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      kanban_card_criticidade: {
        Row: {
          board_id: string | null
          client_id: string | null
          entrou_em: string | null
          estado: string | null
          prazo_dias: number | null
          process_id: string | null
          responsavel_user_id: string | null
          ultimo_movimento: string | null
          user_task_id: string | null
          vence_em: string | null
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
            foreignKeyName: "kanban_card_placements_user_task_id_fkey"
            columns: ["user_task_id"]
            isOneToOne: true
            referencedRelation: "user_tasks"
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
            foreignKeyName: "user_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _ator_sistema: { Args: never; Returns: string }
      _avisar_falta_documental: {
        Args: {
          p_assignee: string
          p_assigner: string
          p_client_id: string
          p_process_id: string
          p_processo_num: string
          p_tipo_acao_id: string
        }
        Returns: Json
      }
      _document_types_permitidos: { Args: never; Returns: string[] }
      _fechar_pendencia: {
        Args: { p_motivo: string; p_task_id: string }
        Returns: boolean
      }
      _prazo_fim_do_dia: { Args: { p_data: string }; Returns: string }
      _resolver_processo: {
        Args: { p_process_id: string; p_processo_numero: string }
        Returns: string
      }
      activate_own_profile: { Args: never; Returns: undefined }
      add_business_days: {
        Args: { p_days: number; p_start: string }
        Returns: string
      }
      add_task_comment: {
        Args: { p_body: string; p_task_id: string }
        Returns: Json
      }
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
      admin_clear_user_menu: {
        Args: { p_menu_key: string; p_user_id: string }
        Returns: undefined
      }
      admin_cron_create: {
        Args: { p_command: string; p_name: string; p_schedule: string }
        Returns: number
      }
      admin_cron_delete: { Args: { p_jobid: number }; Returns: boolean }
      admin_cron_list: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          last_message: string
          last_run: string
          last_status: string
          schedule: string
        }[]
      }
      admin_cron_toggle: {
        Args: { p_active: boolean; p_jobid: number }
        Returns: undefined
      }
      admin_list_menu_permissions: {
        Args: never
        Returns: {
          email: string
          granted: boolean
          granted_by: string
          granted_by_name: string
          menu_key: string
          updated_at: string
          user_id: string
        }[]
      }
      admin_set_user_menu: {
        Args: { p_granted: boolean; p_menu_key: string; p_user_id: string }
        Returns: undefined
      }
      advance_user_task: {
        Args: { p_next_task_type_id?: string; p_task_id: string }
        Returns: Json
      }
      agendar_conversao_gov: {
        Args: {
          p_ate?: string
          p_client_id?: string
          p_cliente_nome?: string
          p_observacao?: string
        }
        Returns: Json
      }
      agent_consultar_cliente: {
        Args: { p_busca: string }
        Returns: {
          cpf: string
          full_name: string
          id: string
          status: string
        }[]
      }
      agent_consultar_processo: {
        Args: { p_busca: string }
        Returns: {
          client_id: string
          client_name: string
          id: string
          process_number: string
          responsible_lawyer_user_id: string
          status: string
          tipo_acao_code: string
          tipo_acao_id: string
          tipo_acao_nome: string
        }[]
      }
      agent_consultar_usuario: {
        Args: { p_busca: string }
        Returns: {
          app_roles: string[]
          cargo: string
          email: string
          name: string
          user_id: string
        }[]
      }
      anexar_audio_autorizacao: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_file_path: string
          p_nome_arquivo?: string
          p_process_id?: string
          p_transcricao?: string
        }
        Returns: Json
      }
      aniversariantes_do_dia: {
        Args: never
        Returns: {
          client_id: string
          data_nascimento: string
          idade: number
          is_whatsapp: boolean
          nome: string
          telefone: string
        }[]
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
      apply_ocr_client_fields: {
        Args: { p_client_id: string; p_fields: Json }
        Returns: number
      }
      attach_client_document: {
        Args: {
          p_client_id: string
          p_document_name: string
          p_document_type: string
          p_file_path: string
          p_file_size: number
          p_mime_type: string
        }
        Returns: string
      }
      atualizar_apolice: {
        Args: {
          p_apolice_id: string
          p_cancelada_em?: string
          p_observacao?: string
          p_reconhecida?: boolean
          p_restituicao_valor?: number
        }
        Returns: Json
      }
      atualizar_cliente: {
        Args: { p_client_id: string; p_fields: Json }
        Returns: Json
      }
      atualizar_fase_execucao: {
        Args: {
          p_fase: string
          p_observacao?: string
          p_process_id?: string
          p_processo_numero?: string
        }
        Returns: Json
      }
      atualizar_processo: {
        Args: { p_fields: Json; p_process_id: string }
        Returns: Json
      }
      atualizar_status_credencial_gov: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_observacao?: string
          p_status: string
        }
        Returns: Json
      }
      atualizar_tarefa: {
        Args: {
          p_prazo?: string
          p_prioridade?: string
          p_status?: string
          p_task_id: string
          p_titulo?: string
        }
        Returns: Json
      }
      audiencia_datetime_aviso: { Args: { p_ts: string }; Returns: string }
      audiencias_can_manage: { Args: never; Returns: boolean }
      calculate_llm_cost: {
        Args: {
          p_input_tokens: number
          p_model_id: string
          p_output_tokens: number
          p_provider: string
        }
        Returns: number
      }
      can_view_clients: { Args: never; Returns: boolean }
      cancelar_atendimento: {
        Args: { p_id: string; p_motivo?: string }
        Returns: Json
      }
      claim_user_task: { Args: { p_task_id: string }; Returns: string }
      client_cooperado_checklist: {
        Args: { p_client_id: string }
        Returns: {
          document_type: string
          required: boolean
          sort_order: number
          status: string
        }[]
      }
      client_delete_saved_filter: { Args: { p_id: string }; Returns: undefined }
      client_document_checklist: {
        Args: { p_client_id: string; p_set_code: string }
        Returns: {
          document_type: string
          required: boolean
          sort_order: number
          status: string
        }[]
      }
      client_has_meeting_history: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      client_required_set: { Args: { p_client_id: string }; Returns: string }
      client_save_filter: {
        Args: { p_filter: Json; p_name: string }
        Returns: {
          created_at: string
          filter: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "client_saved_filters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      client_timeline: {
        Args: { p_client_id: string }
        Returns: {
          event_at: string
          event_type: string
          extra: Json
          ref_id: string
          title: string
        }[]
      }
      comparar_analise_com_gabarito: {
        Args: { p_banco?: string }
        Returns: Json
      }
      consultar_analise_extrato: {
        Args: {
          p_analise_id?: string
          p_client_id?: string
          p_cliente_nome?: string
        }
        Returns: Json
      }
      consultar_apolices: {
        Args: {
          p_apenas_nao_reconhecidas?: boolean
          p_client_id?: string
          p_cliente_nome?: string
          p_seguradora?: string
        }
        Returns: Json
      }
      consultar_audiencias: {
        Args: {
          p_ate: string
          p_client_id?: string
          p_cliente_nome?: string
          p_de: string
          p_processo?: string
        }
        Returns: Json
      }
      consultar_diligencias: {
        Args: {
          p_processo_numero?: string
          p_status?: string
          p_vara?: string
          p_vencendo_ate?: string
        }
        Returns: Json
      }
      consultar_documentos_obrigatorios: {
        Args: { p_client_id?: string; p_cliente_nome?: string; p_tese?: string }
        Returns: Json
      }
      consultar_execucoes: {
        Args: {
          p_fase?: string
          p_processo_numero?: string
          p_responsavel?: string
        }
        Returns: Json
      }
      consultar_feriados_pendentes_confirmacao: { Args: never; Returns: Json }
      consultar_procuracoes: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_incluir_historico?: boolean
          p_vencendo_em_dias?: number
        }
        Returns: Json
      }
      consultar_reclamacoes: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_vencendo_ate?: string
        }
        Returns: Json
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
      create_audiencia: {
        Args: {
          p_advogado_user_id?: string
          p_client_id: string
          p_data_hora: string
          p_docs?: Json
          p_link_local?: string
          p_observacoes?: string
          p_parte_contraria?: string
          p_process_id: string
          p_tipo_acao?: string
        }
        Returns: string
      }
      create_chat_task: {
        Args: {
          p_assignee_user_id?: string
          p_client_id?: string
          p_deadline_at?: string
          p_description?: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_title: string
        }
        Returns: string
      }
      create_department_task: {
        Args: {
          p_area?: Database["public"]["Enums"]["legal_area"]
          p_client_id?: string
          p_deadline_at?: string
          p_description?: string
          p_payload?: Json
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_process_id?: string
          p_task_type_id: string
          p_title: string
        }
        Returns: string
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
          p_client_id?: string
          p_client_name?: string
          p_end_time?: string
          p_lawyer_user_id?: string
          p_notes?: string
          p_phone?: string
          p_receptionist_user_id?: string
          p_scheduled_date: string
          p_start_time: string
          p_status?: Database["public"]["Enums"]["meeting_status"]
          p_summary?: string
          p_type?: string
        }
        Returns: string
      }
      create_meeting_task: { Args: { p_meeting_id: string }; Returns: string }
      create_notification: {
        Args: {
          p_actor_user_id?: string
          p_body?: string
          p_entity_id?: string
          p_entity_type?: string
          p_route?: string
          p_title: string
          p_type: string
          p_user_id: string
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
      criar_audiencia: {
        Args: {
          p_data: string
          p_hora: string
          p_local?: string
          p_notes?: string
          p_process_id: string
          p_tipo: string
        }
        Returns: Json
      }
      criar_campanha: {
        Args: { p_filtro?: Json; p_nome: string; p_objetivo: string }
        Returns: Json
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
      criar_processo: {
        Args: {
          p_client_id: string
          p_notes?: string
          p_numero?: string
          p_reu?: string
          p_tipo_acao?: string
        }
        Returns: Json
      }
      criar_tarefa_protocolo: {
        Args: { p_process_id: string; p_revisao_task_id?: string }
        Returns: string
      }
      criar_tarefa_revisao: {
        Args: {
          p_client_document_id?: string
          p_confeccao_task_id?: string
          p_process_id: string
        }
        Returns: string
      }
      cumprir_diligencia: {
        Args: {
          p_diligencia_id: string
          p_protocolo?: string
          p_rediligenciar_em?: string
          p_resultado?: string
        }
        Returns: Json
      }
      dashboard_ia_cost: { Args: never; Returns: Json }
      dashboard_ia_metrics: { Args: never; Returns: Json }
      dashboard_ia_usage_by_user: { Args: never; Returns: Json }
      dashboard_operacional_metrics: {
        Args: { p_include_test?: boolean }
        Returns: Json
      }
      dashboard_prazos_metrics: {
        Args: { p_include_test?: boolean }
        Returns: Json
      }
      dashboard_provider_credits: { Args: never; Returns: Json }
      dashboard_tarefas_metrics: {
        Args: { p_include_test?: boolean }
        Returns: Json
      }
      decidir_lancamento_extrato: {
        Args: {
          p_decisao: string
          p_lancamento_id: string
          p_observacao?: string
        }
        Returns: Json
      }
      decidir_revisao_peca: {
        Args: {
          p_aceite?: boolean
          p_decisao: string
          p_observacoes?: string
          p_task_id: string
        }
        Returns: Database["public"]["Enums"]["user_task_status"]
      }
      definir_tipo_acao_processo: {
        Args: { p_process_id: string; p_tipo_acao_id: string }
        Returns: string
      }
      delete_meeting: { Args: { p_id: string }; Returns: undefined }
      delete_task_attachment: {
        Args: { p_attachment_id: string }
        Returns: string
      }
      distribuir_caso: {
        Args: {
          p_process_id: string
          p_responsible_lawyer_user_id?: string
          p_task_type_id?: string
          p_tipo_acao_id?: string
          p_title?: string
        }
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
      enqueue_task_chat_alert: {
        Args: {
          p_alert_kind?: string
          p_message: string
          p_recipient_user_id: string
          p_task_id: string
        }
        Returns: string
      }
      enviar_alerta_supervisor: {
        Args: { p_content: string; p_user_id: string }
        Returns: string
      }
      fail_stale_orchestration_runs: {
        Args: { p_max_age?: string; p_max_total_age?: string }
        Returns: number
      }
      fila_credenciais_gov: { Args: { p_estado: string }; Returns: Json }
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
      gerar_campanha_renovacao_procuracao: {
        Args: { p_janela_dias?: number; p_nome?: string }
        Returns: Json
      }
      gerar_pendencias_lembrete_audiencia: { Args: never; Returns: Json }
      gerar_pendencias_revisao_execucao: { Args: never; Returns: Json }
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
      get_available_slots: {
        Args: { p_date: string }
        Returns: {
          slot: string
        }[]
      }
      get_business_hours: { Args: never; Returns: Json }
      get_client_priority_phone: {
        Args: { p_client_id: string }
        Returns: string
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
      get_google_calendar_credentials: { Args: never; Returns: Json }
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
      get_meeting_audit: {
        Args: { p_meeting_id: string }
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
      get_my_client_saved_filters: {
        Args: never
        Returns: {
          created_at: string
          filter: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_saved_filters"
          isOneToOne: false
          isSetofReturn: true
        }
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
      get_my_menu_overrides: {
        Args: never
        Returns: {
          granted: boolean
          menu_key: string
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
      get_or_create_supervisor_alert_session: {
        Args: { p_user_id: string }
        Returns: string
      }
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
      get_revisao_peca_context: { Args: { p_task_id: string }; Returns: Json }
      get_sector_workload: {
        Args: { p_target_role_code: string }
        Returns: {
          full_name: string
          is_least_loaded: boolean
          pending_count: number
          user_id: string
        }[]
      }
      get_supervisor_agent_id: { Args: never; Returns: string }
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
      get_unread_notifications_count: { Args: never; Returns: number }
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
      gov_decrypt: { Args: { p_cipher: string }; Returns: string }
      gov_encrypt: { Args: { p_plain: string }; Returns: string }
      has_menu_grant: {
        Args: { _menu_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_ping: { Args: never; Returns: undefined }
      importar_audiencias_planilha: {
        Args: { p_dry_run?: boolean; p_lote: Json; p_offsets?: number[] }
        Returns: Json
      }
      importar_clientes_planilha: { Args: { p_lote: Json }; Returns: Json }
      importar_gabarito_extrato: {
        Args: { p_banco?: string; p_lote: Json }
        Returns: Json
      }
      importar_matriz_documentos: {
        Args: { p_lote: Json; p_substituir?: boolean }
        Returns: Json
      }
      importar_processos_execucoes_planilha: {
        Args: { p_dry_run?: boolean; p_lote: Json; p_user_id?: string }
        Returns: Json
      }
      importar_processos_posicional: {
        Args: { p_dry_run?: boolean; p_lote: Json; p_user_id?: string }
        Returns: Json
      }
      importar_telefones_planilha: { Args: { p_lote: Json }; Returns: Json }
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
      iniciar_execucao: {
        Args: {
          p_fase?: string
          p_observacao?: string
          p_process_id?: string
          p_processo_numero?: string
          p_responsavel_nome?: string
          p_reu_nome?: string
          p_reu_tipo?: string
          p_valor?: number
        }
        Returns: Json
      }
      integration_list_rpcs: { Args: never; Returns: string[] }
      integration_list_tables: { Args: never; Returns: string[] }
      is_business_datetime: { Args: { p_ts: string }; Returns: boolean }
      is_cliente_cooperado: { Args: { p_client_id: string }; Returns: boolean }
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      is_own_profile_active: { Args: never; Returns: boolean }
      is_recepcao: { Args: never; Returns: boolean }
      is_recepcao_or_socio: { Args: never; Returns: boolean }
      is_role_eligible_for_task: {
        Args: { p_role_template_id: string; p_task_type_id: string }
        Returns: boolean
      }
      is_socio: { Args: never; Returns: boolean }
      is_socio_or_advogado: { Args: never; Returns: boolean }
      is_user_online: {
        Args: { p_threshold_minutes?: number; p_user_id: string }
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
      kpi_ligacoes: { Args: { p_ate?: string; p_de?: string }; Returns: Json }
      list_assignable_users: {
        Args: never
        Returns: {
          name: string
          role_label: string
          user_id: string
        }[]
      }
      list_client_processes: {
        Args: { p_client_id: string; p_client_name: string }
        Returns: {
          description: string
          id: string
          process_number: string
        }[]
      }
      list_meeting_lawyers: {
        Args: never
        Returns: {
          name: string
          role_label: string
          user_id: string
        }[]
      }
      list_task_comments: {
        Args: { p_task_id: string }
        Returns: {
          author_name: string
          author_user_id: string
          body: string
          created_at: string
          id: string
        }[]
      }
      list_testable_sectors: { Args: never; Returns: Json }
      list_users_for_inter_assistant: {
        Args: never
        Returns: {
          full_name: string
          has_assistant: boolean
          role_label: string
          user_id: string
        }[]
      }
      listar_descartaveis_chat_attachments: {
        Args: never
        Returns: {
          created_at: string
          etag: string
          name: string
          sz: number
        }[]
      }
      listar_duplicatas_chat_attachments: {
        Args: never
        Returns: {
          created_at: string
          etag: string
          name: string
          sz: number
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { p_id: string }; Returns: undefined }
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
      meeting_slot_is_valid: {
        Args: { p_date: string; p_start: string }
        Returns: boolean
      }
      meetings_can_access: { Args: never; Returns: boolean }
      meetings_can_create: { Args: never; Returns: boolean }
      minha_agenda: { Args: { p_ate?: string; p_de?: string }; Returns: Json }
      normalizar_banco: { Args: { p_texto: string }; Returns: string }
      notificar_pendencias_data_fatal: {
        Args: { p_dias_aviso?: number }
        Returns: number
      }
      notificar_reunioes_proximas: { Args: never; Returns: number }
      notificar_tarefas_no_horario: { Args: never; Returns: number }
      pii_bidx: { Args: { p_input: string }; Returns: string }
      pii_decrypt: { Args: { p_cipher: string }; Returns: string }
      pii_encrypt: { Args: { p_plain: string }; Returns: string }
      pode_operar_pendencia: {
        Args: {
          _task: Database["public"]["Tables"]["user_tasks"]["Row"]
          _user_id: string
        }
        Returns: boolean
      }
      preparar_audiencia: { Args: { p_audiencia_id: string }; Returns: Json }
      processar_procuracoes_vencendo: {
        Args: { p_janela_dias?: number }
        Returns: Json
      }
      processar_verificacao_pos_atendimento: {
        Args: { p_task_id: string }
        Returns: Json
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
      reagendar_atendimento: {
        Args: { p_id: string; p_nova_data: string; p_nova_hora: string }
        Returns: Json
      }
      reavaliar_falta_documental: {
        Args: { p_client_id: string }
        Returns: Json
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
      registrar_analise_extrato: {
        Args: {
          p_banco: string
          p_client_document_id?: string
          p_client_id: string
          p_custo_usd?: number
          p_modelo?: string
          p_periodo_fim?: string
          p_periodo_inicio?: string
        }
        Returns: Json
      }
      registrar_apolice: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_numero_apolice?: string
          p_numero_processo_susep?: string
          p_observacao?: string
          p_origem_desconto?: string
          p_premio_periodicidade?: string
          p_premio_valor?: number
          p_produto?: string
          p_reconhecida?: boolean
          p_seguradora: string
          p_vigencia_inicio?: string
        }
        Returns: Json
      }
      registrar_credencial_gov: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_nivel?: string
          p_senha: string
          p_status_acesso?: string
          p_tem_2fa?: boolean
          p_usuario?: string
        }
        Returns: Json
      }
      registrar_desfecho_chat: {
        Args: {
          p_client_cpf_masked?: string
          p_client_id?: string
          p_client_name?: string
          p_kind?: string
          p_session_id: string
          p_summary: string
        }
        Returns: string
      }
      registrar_diligencia: {
        Args: {
          p_descricao: string
          p_observacao?: string
          p_prazo?: string
          p_process_id?: string
          p_processo_numero?: string
          p_responsavel_nome?: string
          p_tipo?: string
          p_vara?: string
        }
        Returns: Json
      }
      registrar_evento_processual: {
        Args: {
          p_data_evento?: string
          p_evento: string
          p_observacao?: string
          p_process_id?: string
          p_processo_numero?: string
        }
        Returns: Json
      }
      registrar_lancamento_extrato: {
        Args: {
          p_analise_id: string
          p_categoria: string
          p_confianca?: number
          p_data?: string
          p_descricao: string
          p_justificativa?: string
          p_valor?: number
        }
        Returns: Json
      }
      registrar_lembrete_audiencia: {
        Args: {
          p_lembrete_id: string
          p_observacao?: string
          p_status?: string
        }
        Returns: Json
      }
      registrar_ligacao: {
        Args: {
          p_campanha_id?: string
          p_client_id?: string
          p_cliente_nome?: string
          p_observacao?: string
          p_resultado: string
          p_retornar_em?: string
        }
        Returns: Json
      }
      registrar_procuracao: {
        Args: {
          p_client_document_id?: string
          p_client_id?: string
          p_cliente_nome?: string
          p_data_assinatura: string
          p_observacao?: string
          p_tipo?: string
          p_validade_meses?: number
        }
        Returns: Json
      }
      registrar_protocolo: {
        Args: { p_observacao?: string; p_task_id: string }
        Returns: Json
      }
      registrar_reclamacao: {
        Args: {
          p_client_id?: string
          p_cliente_nome?: string
          p_data_reclamacao?: string
          p_observacao?: string
          p_orgao: string
          p_prazo_fatal?: string
          p_prazo_resposta?: string
          p_process_id?: string
          p_protocolo?: string
          p_tese?: string
        }
        Returns: Json
      }
      registrar_relacao_bancaria: {
        Args: {
          p_banco?: string
          p_banco_beneficio?: string
          p_client_id?: string
          p_cliente_nome?: string
          p_contrato_em_posse?: boolean
          p_extrato_ano?: number
          p_extrato_em_posse?: boolean
          p_notes?: string
          p_reconhece?: boolean
          p_tipo_relacao?: string
        }
        Returns: Json
      }
      registrar_resposta_reclamacao: {
        Args: {
          p_desfecho: string
          p_reclamacao_id: string
          p_resposta_em?: string
          p_resposta_texto?: string
        }
        Returns: Json
      }
      remarcar_revisao_execucao: {
        Args: {
          p_dias: number
          p_intervalo_recorrente?: number
          p_process_id?: string
          p_processo_numero?: string
        }
        Returns: Json
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
      reschedule_user_task: {
        Args: {
          p_justificativa: string
          p_new_deadline: string
          p_task_id: string
        }
        Returns: string
      }
      resolve_model_price: {
        Args: { p_model: string }
        Returns: {
          input_price: number
          model_id: string
          output_price: number
        }[]
      }
      resolver_pendencia: {
        Args: { p_id: string; p_resolucao?: string }
        Returns: string
      }
      resolver_tese: { Args: { p_termo: string }; Returns: Json }
      resolver_tipo_acao: { Args: { p_termo: string }; Returns: Json }
      resumo_do_dia: { Args: never; Returns: Json }
      reveal_gov_credential: {
        Args: { p_client_id: string }
        Returns: {
          gov_senha: string
          gov_usuario: string
        }[]
      }
      reverificar_atendimentos_cliente: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      safe_jsonb: { Args: { p: string }; Returns: Json }
      salvar_peca: {
        Args: {
          p_client_id: string
          p_confeccao_task_id?: string
          p_document_name: string
          p_document_type?: string
          p_file_path: string
          p_mime_type?: string
          p_process_id?: string
          p_reviewer_user_id?: string
        }
        Returns: Json
      }
      save_client: { Args: { p_data: Json; p_id: string }; Returns: string }
      save_gov_credential: {
        Args: {
          p_client_id: string
          p_consentimento?: boolean
          p_consentimento_versao?: string
          p_senha?: string
          p_status_acesso?: string
          p_tem_2fa?: boolean
          p_usuario?: string
        }
        Returns: string
      }
      search_clients: {
        Args: { p_filtros?: Json }
        Returns: {
          city: string
          client_origin: string
          created_at: string
          full_name: string
          gov_br_profile: string
          id: string
          state: string
          status: string
        }[]
      }
      search_clients_by_cpf: {
        Args: { cpf_input: string }
        Returns: {
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
          cpf_bidx: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          fantasy_name: string | null
          father_name: string | null
          foundation_date: string | null
          full_name: string | null
          gender: string | null
          gov_br_profile: string | null
          id: string | null
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
          phone_commercial_is_whatsapp: boolean | null
          phone_home: string | null
          phone_home_is_whatsapp: boolean | null
          phone_is_whatsapp: boolean | null
          pis_nit: string | null
          pix_key: string | null
          pix_key_type: string | null
          profession: string | null
          responsible_lawyer_id: string | null
          rg: string | null
          rg_issuer: string | null
          rg_uf: string | null
          state: string | null
          status: string | null
          status_atendimento: string | null
          status_comercial: string | null
          status_documental: string | null
          status_juridico: string | null
          status_processo: string | null
          tipo_pessoa: string | null
          updated_at: string | null
          zip_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "clients_decrypted"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_agent_tools: {
        Args: { p_agent_id: string; p_tool_codes: string[] }
        Returns: undefined
      }
      set_business_hours: { Args: { p_config: Json }; Returns: Json }
      set_provider_budget: {
        Args: {
          p_budget_usd: number
          p_notes?: string
          p_provider: string
          p_start?: string
        }
        Returns: undefined
      }
      set_sistema_flag: {
        Args: { p_ativo: boolean; p_chave: string }
        Returns: Json
      }
      somar_dias_uteis: {
        Args: { p_dias: number; p_inicio: string }
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
      sugerir_execucao_pos_prazo: { Args: never; Returns: Json }
      supervisor_check_atendimentos: { Args: never; Returns: number }
      transferir_pendencia: {
        Args: {
          p_departamento_destino?: Database["public"]["Enums"]["org_stage"]
          p_id: string
          p_responsavel_destino?: string
        }
        Returns: string
      }
      trigger_send_email_notifications: { Args: never; Returns: number }
      trigger_sync_provider_credits: { Args: never; Returns: number }
      txt_fold: { Args: { p: string }; Returns: string }
      update_audiencia: {
        Args: {
          p_advogado_user_id?: string
          p_data_hora?: string
          p_docs?: Json
          p_id: string
          p_link_local?: string
          p_observacoes?: string
          p_parte_contraria?: string
          p_status?: Database["public"]["Enums"]["audiencia_status"]
          p_tipo_acao?: string
        }
        Returns: undefined
      }
      update_meeting: {
        Args: {
          p_client_id: string
          p_client_name: string
          p_end_time: string
          p_id: string
          p_lawyer_user_id: string
          p_notes: string
          p_phone: string
          p_receptionist_user_id: string
          p_scheduled_date: string
          p_start_time: string
          p_status: Database["public"]["Enums"]["meeting_status"]
          p_summary: string
          p_type: string
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
      verificar_ancora_24_1: {
        Args: { p_process_id: string; p_tipo_acao_id?: string }
        Returns: {
          faltando: string[]
          ok: boolean
        }[]
      }
      verificar_documentos_obrigatorios: {
        Args: {
          p_client_id?: string
          p_process_id?: string
          p_tipo_acao_id?: string
        }
        Returns: Json
      }
      verificar_gate_protocolo: { Args: { p_task_id: string }; Returns: Json }
      verificar_pos_atendimento: { Args: { p_task_id: string }; Returns: Json }
      verificar_processo_duplicado: {
        Args: { p_client_id: string; p_reu?: string; p_tipo_acao_id?: string }
        Returns: Json
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
      audiencia_status:
        | "marcada"
        | "confirmada"
        | "realizada"
        | "redesignada"
        | "cancelada"
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
        | "pos_atendimento_incompleto"
      inter_assistant_status:
        | "pending"
        | "in_progress"
        | "answered"
        | "denied"
        | "expired"
      legal_area:
        | "bancario"
        | "familia"
        | "plano_saude"
        | "consumidor"
        | "civil"
        | "previdenciario"
        | "tributario"
      meeting_status:
        | "scheduled"
        | "confirmed"
        | "rescheduled"
        | "canceled"
        | "no_show"
        | "done"
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
  graphql_public: {
    Enums: {},
  },
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
      audiencia_status: [
        "marcada",
        "confirmada",
        "realizada",
        "redesignada",
        "cancelada",
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
        "pos_atendimento_incompleto",
      ],
      inter_assistant_status: [
        "pending",
        "in_progress",
        "answered",
        "denied",
        "expired",
      ],
      legal_area: [
        "bancario",
        "familia",
        "plano_saude",
        "consumidor",
        "civil",
        "previdenciario",
        "tributario",
      ],
      meeting_status: [
        "scheduled",
        "confirmed",
        "rescheduled",
        "canceled",
        "no_show",
        "done",
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
