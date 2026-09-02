// =============================================================
// Tipagem do schema do Supabase (gerada manualmente a partir das
// migrations em supabase/migrations). Objetivo: autocomplete de
// colunas no editor e validacao leve de nomes. Os valores sao
// left as `any` de proposito — a tipagem estrita completa deve
// ser gerada com `npx supabase gen types` apos configurar o CLI
// (https://supabase.com/docs/guides/api/rest/generating-types).
//
// Alem de nao tiparmos mais o necessario, as relacoes (embeds)
// usadas nos .select() estao declaradas abaixo para que as consultas
// com subselecao (ex.: fichas(*, treinos_ficha(...))) continuem
// compilando e autocompletando.
// =============================================================

type RelationshipType = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type AnyRow = Record<string, any>;

interface TableDefinition {
  Row: AnyRow;
  Insert: AnyRow;
  Update: AnyRow;
  Relationships: RelationshipType[];
}

export interface Database {
  public: {
    Tables: {
      usuarios: TableDefinition;
      fichas: TableDefinition;
      periodizacoes: TableDefinition;
      treinos_ficha: TableDefinition;
      exercicios_treino: TableDefinition;
      refeicoes_dieta: TableDefinition;
      planejamento_semanal: TableDefinition;
      logs_treino: TableDefinition;
      logs_execucao: TableDefinition;
      logs_cardio: TableDefinition;
      muscle_group_goals: TableDefinition;
      activities: TableDefinition;
      meals: TableDefinition;
      fixed_foods: TableDefinition;
      avaliacoes_fisicas: TableDefinition;
      avaliacoes_os: TableDefinition;
      acompanhamentos_os: TableDefinition;
    };
    Views: Record<string, never>;
    Functions: {
      check_email_exists: {
        Args: { email_input: string };
        Returns: boolean;
      };
      criar_ficha: {
        Args: { p_user_id: string; p_nome: string; p_tipo: string };
        Returns: AnyRow;
      };
      criar_avaliacao_os: {
        Args: { p_user_id: string; p_dados: AnyRow };
        Returns: AnyRow;
      };
      criar_acompanhamento_os: {
        Args: { p_user_id: string; p_dados: AnyRow };
        Returns: AnyRow;
      };
      salvar_planejamento: {
        Args: { p_user_id: string; p_semana: AnyRow[]; p_meta_cardio?: number | null };
        Returns: undefined;
      };
      renovar_plano: {
        Args: { p_user_id: string };
        Returns: AnyRow;
      };
    };
  };
}