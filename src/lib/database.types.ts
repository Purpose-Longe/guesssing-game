export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      game_sessions: {
        Row: {
          id: string;
          code: string;
          game_master_id: string | null;
          status: 'waiting' | 'in_progress' | 'ended';
          current_question: string | null;
          current_answer: string | null;
          game_started_at: string | null;
          game_ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          game_master_id?: string | null;
          status?: 'waiting' | 'in_progress' | 'ended';
          current_question?: string | null;
          current_answer?: string | null;
          game_started_at?: string | null;
          game_ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          game_master_id?: string | null;
          status?: 'waiting' | 'in_progress' | 'ended';
          current_question?: string | null;
          current_answer?: string | null;
          game_started_at?: string | null;
          game_ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      players: {
        Row: {
          id: string;
          session_id: string;
          username: string;
          user_id: string | null;
          score: number;
          is_active: boolean;
          joined_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          username: string;
          user_id?: string | null;
          score?: number;
          is_active?: boolean;
          joined_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          username?: string;
          user_id?: string | null;
          score?: number;
          is_active?: boolean;
          joined_at?: string;
          updated_at?: string;
        };
      };
      game_attempts: {
        Row: {
          id: string;
          session_id: string;
          player_id: string;
          guess: string;
          is_correct: boolean;
          attempt_number: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          player_id: string;
          guess: string;
          is_correct?: boolean;
          attempt_number: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          player_id?: string;
          guess?: string;
          is_correct?: boolean;
          attempt_number?: number;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          session_id: string;
          player_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          player_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          player_id?: string;
          content?: string;
          created_at?: string;
        };
      };
      rounds: {
        Row: {
          id: string;
          session_id: string;
          question: string;
          answer: string;
          winner_id: string | null;
          attempts_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          question: string;
          answer: string;
          winner_id?: string | null;
          attempts_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          question?: string;
          answer?: string;
          winner_id?: string | null;
          attempts_count?: number;
          created_at?: string;
        };
      };
    };
    Views: { [key: string]: { Row: unknown } };
    Functions: { [key: string]: { Args: unknown; Returns: unknown } };
    Enums: { [key: string]: string };
  };
}

