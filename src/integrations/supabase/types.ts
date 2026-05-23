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
      event_status_history: {
        Row: {
          changed_at: string
          detected_via: Database["public"]["Enums"]["status_detection_method"]
          event_id: string
          from_status: Database["public"]["Enums"]["event_status"] | null
          id: string
          notes: string | null
          to_status: Database["public"]["Enums"]["event_status"]
          user_id: string
        }
        Insert: {
          changed_at?: string
          detected_via: Database["public"]["Enums"]["status_detection_method"]
          event_id: string
          from_status?: Database["public"]["Enums"]["event_status"] | null
          id?: string
          notes?: string | null
          to_status: Database["public"]["Enums"]["event_status"]
          user_id: string
        }
        Update: {
          changed_at?: string
          detected_via?: Database["public"]["Enums"]["status_detection_method"]
          event_id?: string
          from_status?: Database["public"]["Enums"]["event_status"] | null
          id?: string
          notes?: string | null
          to_status?: Database["public"]["Enums"]["event_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_status_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          ends_at: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          location: string | null
          location_is_gated: boolean
          raw_data: Json | null
          source_event_id: string
          source_type: Database["public"]["Enums"]["event_source"]
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          status_detection_method: Database["public"]["Enums"]["status_detection_method"]
          status_is_inferred: boolean
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          ends_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          location?: string | null
          location_is_gated?: boolean
          raw_data?: Json | null
          source_event_id: string
          source_type: Database["public"]["Enums"]["event_source"]
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          status_detection_method?: Database["public"]["Enums"]["status_detection_method"]
          status_is_inferred?: boolean
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          ends_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          location?: string | null
          location_is_gated?: boolean
          raw_data?: Json | null
          source_event_id?: string
          source_type?: Database["public"]["Enums"]["event_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          status_detection_method?: Database["public"]["Enums"]["status_detection_method"]
          status_is_inferred?: boolean
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      source_subscriptions: {
        Row: {
          created_at: string
          ical_url: string | null
          id: string
          last_poll_error: string | null
          last_polled_at: string | null
          source_type: Database["public"]["Enums"]["event_source"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ical_url?: string | null
          id?: string
          last_poll_error?: string | null
          last_polled_at?: string | null
          source_type: Database["public"]["Enums"]["event_source"]
          user_id: string
        }
        Update: {
          created_at?: string
          ical_url?: string | null
          id?: string
          last_poll_error?: string | null
          last_polled_at?: string | null
          source_type?: Database["public"]["Enums"]["event_source"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      event_source: "partiful" | "luma" | "techweek_a16z"
      event_status:
        | "pending"
        | "waitlist"
        | "approved"
        | "invited"
        | "interested"
        | "declined"
      status_detection_method:
        | "ical_pending_tag"
        | "ical_location_reveal"
        | "luma_email_subject"
        | "screenshot_upload"
        | "manual"
        | "initial_import"
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
      event_source: ["partiful", "luma", "techweek_a16z"],
      event_status: [
        "pending",
        "waitlist",
        "approved",
        "invited",
        "interested",
        "declined",
      ],
      status_detection_method: [
        "ical_pending_tag",
        "ical_location_reveal",
        "luma_email_subject",
        "screenshot_upload",
        "manual",
        "initial_import",
      ],
    },
  },
} as const
