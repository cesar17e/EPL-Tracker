// src/db/types.ts, holds the interfaces for the sql tables 
export interface User {
    id: number;               // BIGSERIAL -> number
    email: string;            // TEXT
    password_hash: string;    // TEXT
    email_verified: boolean;  // BOOLEAN
    email_opt_in: boolean;    // BOOLEAN
    time_zone: string;        // TEXT
    created_at: Date;         // TIMESTAMPTZ -> Date
    updated_at: Date;         // TIMESTAMPTZ -> Date
  }