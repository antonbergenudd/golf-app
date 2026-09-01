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
      challenge_verifications: {
        Row: {
          cancelled_at: string | null
          card_id: string | null
          challenge_description: string | null
          challenge_title: string | null
          challenge_type: string | null
          claimant_id: string | null
          claimant_name: string | null
          confirmation: Json | null
          created_at: string
          deputy_id: string | null
          deputy_name: string | null
          game_id: string
          hole: number | null
          id: string
          points_to_award: number
          resolved_at: string | null
          status: string
          verifier_id: string | null
          verifier_name: string | null
        }
        Insert: {
          cancelled_at?: string | null
          card_id?: string | null
          challenge_description?: string | null
          challenge_title?: string | null
          challenge_type?: string | null
          claimant_id?: string | null
          claimant_name?: string | null
          confirmation?: Json | null
          created_at?: string
          deputy_id?: string | null
          deputy_name?: string | null
          game_id: string
          hole?: number | null
          id?: string
          points_to_award?: number
          resolved_at?: string | null
          status?: string
          verifier_id?: string | null
          verifier_name?: string | null
        }
        Update: {
          cancelled_at?: string | null
          card_id?: string | null
          challenge_description?: string | null
          challenge_title?: string | null
          challenge_type?: string | null
          claimant_id?: string | null
          claimant_name?: string | null
          confirmation?: Json | null
          created_at?: string
          deputy_id?: string | null
          deputy_name?: string | null
          game_id?: string
          hole?: number | null
          id?: string
          points_to_award?: number
          resolved_at?: string | null
          status?: string
          verifier_id?: string | null
          verifier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_verifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_events: {
        Row: {
          event_data: Json
          event_type: string
          game_id: string
          id: string
          player_id: string
          player_name: string
          timestamp: string
        }
        Insert: {
          event_data?: Json
          event_type: string
          game_id: string
          id?: string
          player_id: string
          player_name: string
          timestamp?: string
        }
        Update: {
          event_data?: Json
          event_type?: string
          game_id?: string
          id?: string
          player_id?: string
          player_name?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          action_buy_locked_until_hole: Json
          action_steal_armed: Json
          created_at: string
          current_hole: number
          hidden_balance_until_hole: Json
          holes: number
          id: string
          mode: string
          name: string
          player_ids: string[]
          player_points: Json
          status: string
          updated_at: string
        }
        Insert: {
          action_buy_locked_until_hole?: Json
          action_steal_armed?: Json
          created_at?: string
          current_hole?: number
          hidden_balance_until_hole?: Json
          holes?: number
          id?: string
          mode?: string
          name: string
          player_ids?: string[]
          player_points?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          action_buy_locked_until_hole?: Json
          action_steal_armed?: Json
          created_at?: string
          current_hole?: number
          hidden_balance_until_hole?: Json
          holes?: number
          id?: string
          mode?: string
          name?: string
          player_ids?: string[]
          player_points?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      global_effects: {
        Row: {
          direct_cards: Json
          game_id: string
          hole: number | null
          passive_effects: Json
          updated_at: string
        }
        Insert: {
          direct_cards?: Json
          game_id: string
          hole?: number | null
          passive_effects?: Json
          updated_at?: string
        }
        Update: {
          direct_cards?: Json
          game_id?: string
          hole?: number | null
          passive_effects?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_effects_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      lobbies: {
        Row: {
          code: string
          created_at: string
          game_id: string | null
          host_id: string
          host_name: string
          id: string
          max_players: number
          name: string
          planned_holes: number
          planned_mode: string
          players: Json
          starting_points: number
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          game_id?: string | null
          host_id: string
          host_name: string
          id?: string
          max_players?: number
          name: string
          planned_holes?: number
          planned_mode?: string
          players?: Json
          starting_points?: number
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          game_id?: string | null
          host_id?: string
          host_name?: string
          id?: string
          max_players?: number
          name?: string
          planned_holes?: number
          planned_mode?: string
          players?: Json
          starting_points?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobbies_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      player_cards: {
        Row: {
          action_rerolls_used: number
          cards: Json
          challenge_rerolls_used: number
          created_at: string
          game_id: string
          hide_next_challenge_draw_popup: boolean | null
          hole: number | null
          id: string
          player_id: string
          updated_at: string
        }
        Insert: {
          action_rerolls_used?: number
          cards?: Json
          challenge_rerolls_used?: number
          created_at?: string
          game_id: string
          hide_next_challenge_draw_popup?: boolean | null
          hole?: number | null
          id: string
          player_id: string
          updated_at?: string
        }
        Update: {
          action_rerolls_used?: number
          cards?: Json
          challenge_rerolls_used?: number
          created_at?: string
          game_id?: string
          hide_next_challenge_draw_popup?: boolean | null
          hole?: number | null
          id?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_cards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          email: string
          handicap: number
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email?: string
          handicap?: number
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          handicap?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      scores: {
        Row: {
          created_at: string
          game_id: string | null
          hole: number
          id: string
          player_id: string
          player_name: string
          strokes: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          hole: number
          id?: string
          player_id: string
          player_name: string
          strokes: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string | null
          hole?: number
          id?: string
          player_id?: string
          player_name?: string
          strokes?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _discard_action_card: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_mode: string
          p_not_found_msg: string
          p_player_id: string
        }
        Returns: undefined
      }
      apply_point_deltas: {
        Args: { p_deltas: Json; p_game_id: string }
        Returns: Json
      }
      assign_trial_combat_deputy: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_deputy_id: string
          p_deputy_name: string
          p_game_id: string
          p_sponsor_id: string
        }
        Returns: Json
      }
      bank_offer_action: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      claim_challenge: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_player_id: string
        }
        Returns: Json
      }
      discard_banked_action_card: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      discard_pending_action_card: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      is_game_member: {
        Args: { p_game_id: string; p_player_id: string }
        Returns: boolean
      }
      mark_hole_action_consumed: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      remove_action_card: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_game_id: string
          p_player_id: string
        }
        Returns: undefined
      }
      request_challenge_verification: {
        Args: {
          p_card_hole: number
          p_card_id: string
          p_claimant_id: string
          p_claimant_name: string
          p_description: string
          p_game_id: string
          p_points_to_award: number
          p_title: string
          p_type: string
        }
        Returns: string
      }
      resolve_action_steal_copies: {
        Args: { p_card: Json; p_game_id: string; p_source_player_id: string }
        Returns: undefined
      }
      resolve_attack: {
        Args: {
          p_attacker_id: string
          p_attacker_name: string
          p_card: Json
          p_game_id: string
          p_target_id: string
          p_target_name: string
        }
        Returns: Json
      }
      resolve_challenge_verification: {
        Args: {
          p_game_id: string
          p_outcome: string
          p_verification_id: string
          p_verifier_id: string
          p_verifier_name: string
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
    Enums: {},
  },
} as const
