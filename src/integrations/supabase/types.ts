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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      campanas: {
        Row: {
          canal: string | null
          created_at: string
          created_by: string | null
          destinatarios_count: number | null
          destinatarios_ids: string[] | null
          enviada_at: string | null
          estado: string | null
          id: string
          mensaje: string
          nombre: string
          programada_para: string | null
        }
        Insert: {
          canal?: string | null
          created_at?: string
          created_by?: string | null
          destinatarios_count?: number | null
          destinatarios_ids?: string[] | null
          enviada_at?: string | null
          estado?: string | null
          id?: string
          mensaje?: string
          nombre?: string
          programada_para?: string | null
        }
        Update: {
          canal?: string | null
          created_at?: string
          created_by?: string | null
          destinatarios_count?: number | null
          destinatarios_ids?: string[] | null
          enviada_at?: string | null
          estado?: string | null
          id?: string
          mensaje?: string
          nombre?: string
          programada_para?: string | null
        }
        Relationships: []
      }
      configuracion_sistema: {
        Row: {
          clave: string
          created_at: string
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          clave: string
          created_at?: string
          id?: string
          updated_at?: string
          valor?: string
        }
        Update: {
          clave?: string
          created_at?: string
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          avatar_url: string | null
          channel: string | null
          created_at: string
          email: string | null
          id: string
          last_seen: string | null
          manychat_subscriber_id: string | null
          name: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          channel?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_seen?: string | null
          manychat_subscriber_id?: string | null
          name?: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          channel?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_seen?: string | null
          manychat_subscriber_id?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      conversaciones: {
        Row: {
          apellido: string | null
          canal: string | null
          contact_id: string
          created_at: string
          datos_capturados: Json | null
          escalada: boolean
          id: string
          interes: string | null
          leido: boolean
          mensaje_cliente: string
          nombre: string
          notificado_vendedor: boolean
          respuesta_agente: string
          telefono: string | null
          urgencia: string | null
          vendedor_asignado: string | null
        }
        Insert: {
          apellido?: string | null
          canal?: string | null
          contact_id: string
          created_at?: string
          datos_capturados?: Json | null
          escalada?: boolean
          id?: string
          interes?: string | null
          leido?: boolean
          mensaje_cliente: string
          nombre?: string
          notificado_vendedor?: boolean
          respuesta_agente: string
          telefono?: string | null
          urgencia?: string | null
          vendedor_asignado?: string | null
        }
        Update: {
          apellido?: string | null
          canal?: string | null
          contact_id?: string
          created_at?: string
          datos_capturados?: Json | null
          escalada?: boolean
          id?: string
          interes?: string | null
          leido?: boolean
          mensaje_cliente?: string
          nombre?: string
          notificado_vendedor?: boolean
          respuesta_agente?: string
          telefono?: string | null
          urgencia?: string | null
          vendedor_asignado?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string | null
          contact_id: string | null
          created_at: string
          escalated: boolean
          escalated_at: string | null
          escalated_to: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          primer_apertura_vendedor: string | null
          status: string | null
          unread_count: number
        }
        Insert: {
          assigned_to?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string
          escalated?: boolean
          escalated_at?: string | null
          escalated_to?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          primer_apertura_vendedor?: string | null
          status?: string | null
          unread_count?: number
        }
        Update: {
          assigned_to?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string
          escalated?: boolean
          escalated_at?: string | null
          escalated_to?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          primer_apertura_vendedor?: string | null
          status?: string | null
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_actividades: {
        Row: {
          created_at: string
          descripcion: string
          id: string
          lead_id: string | null
          tipo: string
          usuario: string | null
        }
        Insert: {
          created_at?: string
          descripcion?: string
          id?: string
          lead_id?: string | null
          tipo?: string
          usuario?: string | null
        }
        Update: {
          created_at?: string
          descripcion?: string
          id?: string
          lead_id?: string | null
          tipo?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_actividades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          calificacion: string | null
          canal: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          detalle_cierre: string | null
          email: string | null
          estado_cierre: string | null
          etapa: string | null
          id: string
          interes: string | null
          motivo_perdida: string | null
          nombre: string
          notas: string | null
          observaciones_vendedor: string | null
          presupuesto: string | null
          primer_apertura_at: string | null
          score: number | null
          telefono: string | null
          updated_at: string
          urgencia: string | null
          vendedor_asignado: string | null
        }
        Insert: {
          calificacion?: string | null
          canal?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detalle_cierre?: string | null
          email?: string | null
          estado_cierre?: string | null
          etapa?: string | null
          id?: string
          interes?: string | null
          motivo_perdida?: string | null
          nombre?: string
          notas?: string | null
          observaciones_vendedor?: string | null
          presupuesto?: string | null
          primer_apertura_at?: string | null
          score?: number | null
          telefono?: string | null
          updated_at?: string
          urgencia?: string | null
          vendedor_asignado?: string | null
        }
        Update: {
          calificacion?: string | null
          canal?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detalle_cierre?: string | null
          email?: string | null
          estado_cierre?: string | null
          etapa?: string | null
          id?: string
          interes?: string | null
          motivo_perdida?: string | null
          nombre?: string
          notas?: string | null
          observaciones_vendedor?: string | null
          presupuesto?: string | null
          primer_apertura_at?: string | null
          score?: number | null
          telefono?: string | null
          updated_at?: string
          urgencia?: string | null
          vendedor_asignado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel: string | null
          contact_id: string | null
          content: string
          conversation_id: string | null
          created_at: string
          direction: string
          id: string
          manychat_message_id: string | null
          sent_at: string | null
        }
        Insert: {
          channel?: string | null
          contact_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          manychat_message_id?: string | null
          sent_at?: string | null
        }
        Update: {
          channel?: string | null
          contact_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          manychat_message_id?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          aire_acondicionado: boolean
          anio: string
          color: string
          combustible: string
          comentarios: string
          created_at: string
          equipamiento_extra: string[]
          estado: string
          folio: string
          fotos: string[]
          id: string
          kilometraje: number
          marca: string
          modelo: string
          n_motor: string
          patente: string
          precio_costo: number
          precio_venta: number
          sucursal: string
          tipo: string
          traccion: string
          transmision: string
          ubicacion: string
          updated_at: string
          usuario_asignado: string
          vin: string
        }
        Insert: {
          aire_acondicionado?: boolean
          anio?: string
          color?: string
          combustible?: string
          comentarios?: string
          created_at?: string
          equipamiento_extra?: string[]
          estado?: string
          folio?: string
          fotos?: string[]
          id?: string
          kilometraje?: number
          marca?: string
          modelo?: string
          n_motor?: string
          patente?: string
          precio_costo?: number
          precio_venta?: number
          sucursal?: string
          tipo?: string
          traccion?: string
          transmision?: string
          ubicacion?: string
          updated_at?: string
          usuario_asignado?: string
          vin?: string
        }
        Update: {
          aire_acondicionado?: boolean
          anio?: string
          color?: string
          combustible?: string
          comentarios?: string
          created_at?: string
          equipamiento_extra?: string[]
          estado?: string
          folio?: string
          fotos?: string[]
          id?: string
          kilometraje?: number
          marca?: string
          modelo?: string
          n_motor?: string
          patente?: string
          precio_costo?: number
          precio_venta?: number
          sucursal?: string
          tipo?: string
          traccion?: string
          transmision?: string
          ubicacion?: string
          updated_at?: string
          usuario_asignado?: string
          vin?: string
        }
        Relationships: []
      }
      vendedores: {
        Row: {
          activo: boolean | null
          clave: string | null
          created_at: string
          email: string | null
          id: string
          nombre: string
          rol: string
          sucursal: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean | null
          clave?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          rol?: string
          sucursal?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean | null
          clave?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          rol?: string
          sucursal?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      asignar_siguiente_vendedor: { Args: { _rotacion: Json }; Returns: string }
      increment_unread: { Args: { conv_id: string }; Returns: undefined }
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
  public: {
    Enums: {},
  },
} as const
