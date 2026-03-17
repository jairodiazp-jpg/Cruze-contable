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
      backups: {
        Row: {
          backup_date: string
          company_id: string | null
          completed_at: string | null
          created_at: string
          device_id: string | null
          error_log: string | null
          file_count: number
          folders: string[]
          hostname: string
          id: string
          started_at: string | null
          status: string
          storage_path: string | null
          total_size_bytes: number
          user_email: string
        }
        Insert: {
          backup_date?: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error_log?: string | null
          file_count?: number
          folders?: string[]
          hostname: string
          id?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          total_size_bytes?: number
          user_email: string
        }
        Update: {
          backup_date?: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error_log?: string | null
          file_count?: number
          folders?: string[]
          hostname?: string
          id?: string
          started_at?: string | null
          status?: string
          storage_path?: string | null
          total_size_bytes?: number
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backups_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_applications: {
        Row: {
          app_name: string
          category: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          process_name: string
        }
        Insert: {
          app_name: string
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          process_name: string
        }
        Update: {
          app_name?: string
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          process_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          created_at: string
          domain: string | null
          id: string
          logo_url: string | null
          max_devices: number
          max_users: number
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          max_devices?: number
          max_users?: number
          name: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          max_devices?: number
          max_users?: number
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          device_id: string | null
          delivery_date: string
          department: string | null
          employee_email: string
          employee_name: string
          equipment_desc: string | null
          equipment_id: string | null
          id: string
          observations: string | null
          position: string | null
          return_date: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          delivery_date?: string
          department?: string | null
          employee_email: string
          employee_name: string
          equipment_desc?: string | null
          equipment_id?: string | null
          id?: string
          observations?: string | null
          position?: string | null
          return_date?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          delivery_date?: string
          department?: string | null
          employee_email?: string
          employee_name?: string
          equipment_desc?: string | null
          equipment_id?: string | null
          id?: string
          observations?: string | null
          position?: string | null
          return_date?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
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
            foreignKeyName: "deliveries_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_diagnostics: {
        Row: {
          company_id: string | null
          cpu_usage: number | null
          created_at: string
          device_id: string
          disk_usage: number | null
          dns_status: string | null
          ethernet_status: string | null
          id: string
          internet_status: string | null
          latency_ms: number | null
          overall_health: Database["public"]["Enums"]["device_health"] | null
          packet_loss: number | null
          ram_usage: number | null
          raw_data: Json | null
          wifi_status: string | null
        }
        Insert: {
          company_id?: string | null
          cpu_usage?: number | null
          created_at?: string
          device_id: string
          disk_usage?: number | null
          dns_status?: string | null
          ethernet_status?: string | null
          id?: string
          internet_status?: string | null
          latency_ms?: number | null
          overall_health?: Database["public"]["Enums"]["device_health"] | null
          packet_loss?: number | null
          ram_usage?: number | null
          raw_data?: Json | null
          wifi_status?: string | null
        }
        Update: {
          company_id?: string | null
          cpu_usage?: number | null
          created_at?: string
          device_id?: string
          disk_usage?: number | null
          dns_status?: string | null
          ethernet_status?: string | null
          id?: string
          internet_status?: string | null
          latency_ms?: number | null
          overall_health?: Database["public"]["Enums"]["device_health"] | null
          packet_loss?: number | null
          ram_usage?: number | null
          raw_data?: Json | null
          wifi_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_diagnostics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_diagnostics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          agent_installed: boolean | null
          agent_version: string | null
          company_id: string | null
          connection_type: Database["public"]["Enums"]["connection_type"] | null
          created_at: string
          department: string | null
          device_id: string
          health_status: Database["public"]["Enums"]["device_health"] | null
          hostname: string
          id: string
          ip_address: string | null
          last_seen: string | null
          operating_system: string | null
          report_interval: number
          role_type: string | null
          serial_number: string | null
          updated_at: string
          user_assigned: string | null
          vpn_status: string | null
        }
        Insert: {
          agent_installed?: boolean | null
          agent_version?: string | null
          company_id?: string | null
          connection_type?:
            | Database["public"]["Enums"]["connection_type"]
            | null
          created_at?: string
          department?: string | null
          device_id: string
          health_status?: Database["public"]["Enums"]["device_health"] | null
          hostname: string
          id?: string
          ip_address?: string | null
          last_seen?: string | null
          operating_system?: string | null
          report_interval?: number
          role_type?: string | null
          serial_number?: string | null
          updated_at?: string
          user_assigned?: string | null
          vpn_status?: string | null
        }
        Update: {
          agent_installed?: boolean | null
          agent_version?: string | null
          company_id?: string | null
          connection_type?:
            | Database["public"]["Enums"]["connection_type"]
            | null
          created_at?: string
          department?: string | null
          device_id?: string
          health_status?: Database["public"]["Enums"]["device_health"] | null
          hostname?: string
          id?: string
          ip_address?: string | null
          last_seen?: string | null
          operating_system?: string | null
          report_interval?: number
          role_type?: string | null
          serial_number?: string | null
          updated_at?: string
          user_assigned?: string | null
          vpn_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_configs: {
        Row: {
          applied_at: string | null
          company_id: string | null
          created_at: string
          device_id: string | null
          display_name: string
          domain: string
          error_log: string | null
          exchange_server: string | null
          id: string
          imap_port: number | null
          imap_server: string | null
          provider: string
          smtp_port: number | null
          smtp_server: string | null
          status: string
          updated_at: string
          use_exchange: boolean | null
          user_email: string
        }
        Insert: {
          applied_at?: string | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          display_name: string
          domain: string
          error_log?: string | null
          exchange_server?: string | null
          id?: string
          imap_port?: number | null
          imap_server?: string | null
          provider?: string
          smtp_port?: number | null
          smtp_server?: string | null
          status?: string
          updated_at?: string
          use_exchange?: boolean | null
          user_email: string
        }
        Update: {
          applied_at?: string | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          display_name?: string
          domain?: string
          error_log?: string | null
          exchange_server?: string | null
          id?: string
          imap_port?: number | null
          imap_server?: string | null
          provider?: string
          smtp_port?: number | null
          smtp_server?: string | null
          status?: string
          updated_at?: string
          use_exchange?: boolean | null
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_configs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollment_tokens: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          token: string
          used: boolean
          used_at: string | null
          used_by_device_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          token: string
          used?: boolean
          used_at?: string | null
          used_by_device_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
          used_at?: string | null
          used_by_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollment_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollment_tokens_used_by_device_id_fkey"
            columns: ["used_by_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          assigned_to: string | null
          brand: string
          code: string
          company_id: string | null
          id: string
          location: string | null
          model: string
          os: string | null
          ram: string | null
          registered_at: string
          serial: string
          status: Database["public"]["Enums"]["equipment_status"]
          storage: string | null
          type: Database["public"]["Enums"]["equipment_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          brand: string
          code: string
          company_id?: string | null
          id?: string
          location?: string | null
          model: string
          os?: string | null
          ram?: string | null
          registered_at?: string
          serial: string
          status?: Database["public"]["Enums"]["equipment_status"]
          storage?: string | null
          type?: Database["public"]["Enums"]["equipment_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          brand?: string
          code?: string
          company_id?: string | null
          id?: string
          location?: string | null
          model?: string
          os?: string | null
          ram?: string | null
          registered_at?: string
          serial?: string
          status?: Database["public"]["Enums"]["equipment_status"]
          storage?: string | null
          type?: Database["public"]["Enums"]["equipment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_bypass_attempts: {
        Row: {
          attempt_type: string
          company_id: string | null
          details: Json | null
          detected_at: string
          device_id: string | null
          id: string
        }
        Insert: {
          attempt_type: string
          company_id?: string | null
          details?: Json | null
          detected_at?: string
          device_id?: string | null
          id?: string
        }
        Update: {
          attempt_type?: string
          company_id?: string | null
          details?: Json | null
          detected_at?: string
          device_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_bypass_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firewall_bypass_attempts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_domain_database: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          category: string
          company_id?: string | null
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_domain_database_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_rules: {
        Row: {
          action: string
          applied_at: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          destination_ip: string | null
          device_id: string | null
          direction: string
          enabled: boolean
          error_log: string | null
          id: string
          port_end: number | null
          port_start: number
          priority: number
          profile_id: string | null
          protocol: string
          rule_name: string
          source_ip: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action?: string
          applied_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_ip?: string | null
          device_id?: string | null
          direction?: string
          enabled?: boolean
          error_log?: string | null
          id?: string
          port_end?: number | null
          port_start: number
          priority?: number
          profile_id?: string | null
          protocol?: string
          rule_name: string
          source_ip?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          applied_at?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          destination_ip?: string | null
          device_id?: string | null
          direction?: string
          enabled?: boolean
          error_log?: string | null
          id?: string
          port_end?: number | null
          port_start?: number
          priority?: number
          profile_id?: string | null
          protocol?: string
          rule_name?: string
          source_ip?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firewall_rules_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "firewall_rules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "role_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_schedules: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          days_of_week: number[]
          enabled: boolean
          end_time: string
          id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          category: string
          company_id?: string | null
          created_at?: string
          days_of_week?: number[]
          enabled?: boolean
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          days_of_week?: number[]
          enabled?: boolean
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "firewall_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          author: string | null
          category: string | null
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          solution: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          solution?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          solution?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          activation_date: string | null
          assigned_device_id: string | null
          assigned_user: string | null
          company_id: string | null
          created_at: string
          expiration_date: string | null
          id: string
          license_key: string
          license_type: string
          notes: string | null
          product: string
          status: string
          updated_at: string
        }
        Insert: {
          activation_date?: string | null
          assigned_device_id?: string | null
          assigned_user?: string | null
          company_id?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          license_key: string
          license_type?: string
          notes?: string | null
          product: string
          status?: string
          updated_at?: string
        }
        Update: {
          activation_date?: string | null
          assigned_device_id?: string | null
          assigned_user?: string | null
          company_id?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          license_key?: string
          license_type?: string
          notes?: string | null
          product?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_assigned_device_id_fkey"
            columns: ["assigned_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      role_profile_software: {
        Row: {
          category: string
          created_at: string
          id: string
          install_command: string | null
          is_required: boolean
          profile_id: string
          software_name: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          install_command?: string | null
          is_required?: boolean
          profile_id: string
          software_name: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          install_command?: string | null
          is_required?: boolean
          profile_id?: string
          software_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_profile_software_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "role_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_profiles: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          name: string
          permissions_level: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          name: string
          permissions_level?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          name?: string
          permissions_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      script_executions: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          device_id: string | null
          error_log: string | null
          executed_by: string | null
          id: string
          output: string | null
          script_content: string | null
          script_name: string
          script_type: string
          started_at: string | null
          status: Database["public"]["Enums"]["script_status"] | null
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error_log?: string | null
          executed_by?: string | null
          id?: string
          output?: string | null
          script_content?: string | null
          script_name: string
          script_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["script_status"] | null
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error_log?: string | null
          executed_by?: string | null
          id?: string
          output?: string | null
          script_content?: string | null
          script_name?: string
          script_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["script_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "script_executions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_executions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          action: string
          category: string
          company_id: string | null
          created_at: string
          details: Json | null
          device_id: string | null
          id: string
          message: string
          severity: Database["public"]["Enums"]["log_severity"] | null
          user_id: string | null
        }
        Insert: {
          action: string
          category?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string | null
          id?: string
          message: string
          severity?: Database["public"]["Enums"]["log_severity"] | null
          user_id?: string | null
        }
        Update: {
          action?: string
          category?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          device_id?: string | null
          id?: string
          message?: string
          severity?: Database["public"]["Enums"]["log_severity"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author: string
          created_at: string
          id: string
          text: string
          ticket_id: string
        }
        Insert: {
          author: string
          created_at?: string
          id?: string
          text: string
          ticket_id: string
        }
        Update: {
          author?: string
          created_at?: string
          id?: string
          text?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_tech: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          closed_at: string | null
          code: string
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          requester: string
          requester_email: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_tech?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          code: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester: string
          requester_email: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_tech?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          closed_at?: string | null
          code?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester?: string
          requester_email?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vpn_configs: {
        Row: {
          applied_at: string | null
          assigned_ip: string | null
          auth_type: string | null
          company_id: string | null
          config_data: string | null
          connection_status: string | null
          created_at: string
          device_id: string | null
          display_name: string
          error_log: string | null
          id: string
          last_connected_at: string | null
          protocol: string | null
          server_address: string
          server_port: number | null
          status: string
          updated_at: string
          user_email: string
          vpn_type: string
        }
        Insert: {
          applied_at?: string | null
          assigned_ip?: string | null
          auth_type?: string | null
          company_id?: string | null
          config_data?: string | null
          connection_status?: string | null
          created_at?: string
          device_id?: string | null
          display_name: string
          error_log?: string | null
          id?: string
          last_connected_at?: string | null
          protocol?: string | null
          server_address: string
          server_port?: number | null
          status?: string
          updated_at?: string
          user_email: string
          vpn_type?: string
        }
        Update: {
          applied_at?: string | null
          assigned_ip?: string | null
          auth_type?: string | null
          company_id?: string | null
          config_data?: string | null
          connection_status?: string | null
          created_at?: string
          device_id?: string | null
          display_name?: string
          error_log?: string | null
          id?: string
          last_connected_at?: string | null
          protocol?: string | null
          server_address?: string
          server_port?: number | null
          status?: string
          updated_at?: string
          user_email?: string
          vpn_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vpn_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vpn_configs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "technician" | "user"
      connection_type: "ethernet" | "wifi" | "vpn" | "unknown"
      delivery_status:
        | "pendiente"
        | "en_configuracion"
        | "configurado"
        | "entregado"
        | "devuelto"
      device_health: "healthy" | "warning" | "critical" | "offline"
      equipment_status: "disponible" | "asignado" | "mantenimiento" | "retirado"
      equipment_type:
        | "laptop"
        | "desktop"
        | "monitor"
        | "impresora"
        | "telefono"
        | "tablet"
        | "otro"
      log_severity: "info" | "warning" | "error" | "critical"
      script_status:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      ticket_category: "hardware" | "software" | "red" | "acceso" | "otro"
      ticket_priority: "baja" | "media" | "alta" | "critica"
      ticket_status:
        | "abierto"
        | "en_proceso"
        | "en_espera"
        | "resuelto"
        | "cerrado"
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
      app_role: ["admin", "technician", "user"],
      connection_type: ["ethernet", "wifi", "vpn", "unknown"],
      delivery_status: ["pendiente", "en_configuracion", "configurado", "entregado", "devuelto"],
      device_health: ["healthy", "warning", "critical", "offline"],
      equipment_status: ["disponible", "asignado", "mantenimiento", "retirado"],
      equipment_type: [
        "laptop",
        "desktop",
        "monitor",
        "impresora",
        "telefono",
        "tablet",
        "otro",
      ],
      log_severity: ["info", "warning", "error", "critical"],
      script_status: ["pending", "running", "completed", "failed", "cancelled"],
      ticket_category: ["hardware", "software", "red", "acceso", "otro"],
      ticket_priority: ["baja", "media", "alta", "critica"],
      ticket_status: [
        "abierto",
        "en_proceso",
        "en_espera",
        "resuelto",
        "cerrado",
      ],
    },
  },
} as const
