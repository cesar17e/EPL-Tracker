// src/db/types.ts, holds the interfaces for the sql tables 
export interface User {
    id: number;               // BIGSERIAL -> number
    email: string;            // TEXT
    password_hash: string;    // TEXT
    email_verified: boolean;  // BOOLEAN
    email_opt_in: boolean;    // BOOLEAN
    time_zone: string;        // TEXT
    is_admin: boolean;        // BOOLEAN
    created_at: Date;         // TIMESTAMPTZ -> Date
    updated_at: Date;         // TIMESTAMPTZ -> Date
  }

export interface Team {
    id: number;
    external_team_id: number;
    name: string;
    short_name: string | null;
    symbolic_name: string | null;
    color: string | null;
    away_color: string | null;
    name_for_url: string | null;
    logo_url: string | null;
    image_version: number | null;
  }
