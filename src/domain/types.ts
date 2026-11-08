/** Modelo de dados — campos em snake_case para casar 1:1 com as colunas do PostgreSQL. */

export type ID = string;

export interface BaseEntity {
  id: ID;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
  /** true quando o registro é fictício (demonstração). Nunca apresentar como real. */
  is_demo?: boolean;
  /** Referência externa (ex.: notion:<page_id>) para evitar duplicidade na importação. */
  external_ref?: string | null;
}

export type InstitutionCode = 'CPPEM' | 'UNICIVE' | 'COLEGIO_CPPEM';

export interface Institution extends BaseEntity {
  code: InstitutionCode | string;
  name: string;
  color: string;
  active: boolean;
}

export type Priority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TaskStatus = 'a_fazer' | 'em_andamento' | 'aguardando' | 'concluida' | 'cancelada';
export type Recurrence = 'nenhuma' | 'diaria' | 'semanal' | 'mensal';

export interface ChecklistItem { id: ID; text: string; done: boolean }
export interface HistoryEntry { at: string; action: string; detail?: string }

export interface Task extends BaseEntity {
  title: string;
  description: string;
  institution_id: ID | null;
  priority: Priority;
  status: TaskStatus;
  due_date: string | null; // yyyy-mm-dd
  category: string;
  checklist: ChecklistItem[];
  recurrence: Recurrence;
  is_mission: boolean;
  mission_date: string | null;
  completed_at: string | null;
  history: HistoryEntry[];
  /** ATRIBUIÇÃO do Notion (70% / 20% / 10% / OFF WORK). Também pode ser definida na Central. */
  attribution?: string[];
}

export type BlockStatus = 'planejado' | 'em_andamento' | 'concluido' | 'adiado';

export interface RoutineTemplateBlock {
  id: ID;
  start: string; // HH:mm
  end: string;
  title: string;
  category: string;
  is_break?: boolean;
}

export interface RoutineTemplate extends BaseEntity {
  name: string;
  weekday: number | null; // null = todos os dias úteis
  blocks: RoutineTemplateBlock[];
  is_default: boolean;
}

export interface RoutineBlock extends BaseEntity {
  date: string; // yyyy-mm-dd
  start: string;
  end: string;
  title: string;
  category: string;
  status: BlockStatus;
  notes: string;
  is_break: boolean;
  /** Exceção explícita para uso do intervalo (bloqueado por padrão). */
  break_exception: boolean;
  break_exception_reason: string;
  institution_id: ID | null;
}

export type AgendaKind = 'compromisso' | 'reuniao' | 'entrevista' | 'treinamento' | 'foco';

export interface AgendaEvent extends BaseEntity {
  title: string;
  date: string;
  start: string;
  end: string;
  kind: AgendaKind;
  institution_id: ID | null;
  location: string;
  notes: string;
  /** Evento apenas interno. Nada é criado em calendários externos. */
  external_synced: false;
}

export interface Note extends BaseEntity { date: string; text: string }

export interface Person extends BaseEntity {
  name: string;
  role: string;
  email: string;
  phone: string;
  institution_ids: ID[];
  active: boolean;
  notes: string;
}

export interface FeedbackReview { at: string; text: string; progress: number }

export interface Feedback extends BaseEntity {
  person_id: ID;
  institution_id: ID | null;
  date: string;
  positives: string;
  to_develop: string;
  action_plan: string;
  deadline: string | null;
  status: 'aberto' | 'em_acompanhamento' | 'concluido';
  reviews: FeedbackReview[];
  confidential: boolean;
}

export type CandidateStage =
  | 'recebido' | 'triagem' | 'selecionado' | 'entrevista_agendada'
  | 'entrevistado' | 'aprovado' | 'banco_talentos' | 'reprovado';

export interface Candidate extends BaseEntity {
  name: string;
  phone: string;
  email: string;
  position: string;
  institution_id: ID | null;
  stage: CandidateStage;
  source: string;
  notes: string;
  /** LGPD: consentimento para tratamento dos dados. */
  consent_lgpd: boolean;
  consent_at: string | null;
  retention_until: string | null;
  history: HistoryEntry[];
}

export type AttendanceStatus = 'pendente' | 'confirmada' | 'recusada' | 'compareceu' | 'faltou';

export interface Interview extends BaseEntity {
  candidate_id: ID;
  institution_id: ID | null;
  date: string;
  start: string;
  end: string;
  location: string;
  interviewer: string;
  attendance: AttendanceStatus;
  /** true somente quando o horário foi confirmado com o candidato. */
  time_confirmed: boolean;
  evaluation: string;
  score: number | null;
  decision: 'pendente' | 'aprovado' | 'banco_talentos' | 'reprovado';
}

export interface Training extends BaseEntity {
  title: string;
  track: 'atendimento' | 'objecoes' | 'negociacao' | 'crm' | 'fechamento' | 'outro';
  institution_id: ID | null;
  date: string | null;
  duration_min: number;
  description: string;
  attendees: { person_id: ID; present: boolean; score: number | null }[];
}

export interface MeetingAction { id: ID; text: string; owner: string; deadline: string | null; done: boolean }

export interface Meeting extends BaseEntity {
  title: string;
  institution_id: ID | null;
  date: string;
  start: string;
  end: string;
  template: string;
  agenda: string;
  decisions: string;
  minutes: string;
  actions: MeetingAction[];
  participants: string;
}

export interface SystemItem extends BaseEntity {
  name: string;
  purpose: string;
  owner: string;
  institution_ids: ID[];
  status: 'ativo' | 'em_avaliacao' | 'descontinuado';
  url: string;
}

export type ImprovementStage = 'backlog' | 'analise' | 'planejado' | 'desenvolvimento' | 'testes' | 'concluido';

export interface Improvement extends BaseEntity {
  title: string;
  description: string;
  system_id: ID | null;
  institution_id: ID | null;
  stage: ImprovementStage;
  /** proposta = apenas ideia; implantada = confirmada em produção. */
  kind: 'proposta' | 'implantada';
  implemented_at: string | null;
  impact: string;
}

export interface KeyResult {
  id: ID; title: string; start: number | null; target: number | null; current: number | null; unit: string;
  /** KR vindo do Notion: notion:<id da página do KR>. Ausente em KRs criados na Central. */
  external_ref?: string | null;
  /** Status exatamente como está no Notion (a Central não tem status próprio de KR). */
  status?: string | null;
  period_start?: string | null; // yyyy-mm-dd
  period_end?: string | null;
  /** Progresso calculado pelo Notion (0–100). Somente leitura: nunca é escrito de volta. */
  notion_progress?: number | null;
  /** Espelho do Notion (somente leitura na Central): propriedades "Descrição" e "Motivo:" e o conteúdo da página. */
  description?: string | null;
  reason?: string | null;
  notion_body?: string | null;
}

export interface Objective extends BaseEntity {
  title: string;
  institution_id: ID | null;
  cycle: string; // ex.: 2026-T4
  owner: string;
  key_results: KeyResult[];
}

export interface ProjectStep { id: ID; title: string; owner: string; deadline: string | null; done: boolean; depends_on: ID | null; deliverable: string }

export interface Project extends BaseEntity {
  name: string;
  institution_id: ID | null;
  owner: string;
  description: string;
  /** Status só vira "em_andamento" com confirmação explícita. */
  status: 'proposto' | 'em_andamento' | 'pausado' | 'concluido';
  status_confirmed: boolean;
  start_date: string | null;
  end_date: string | null;
  steps: ProjectStep[];
}

export interface SyncLog extends BaseEntity {
  source: 'notion';
  direction: 'leitura' | 'escrita';
  entity: string;
  status: 'sucesso' | 'erro' | 'revisao';
  message: string;
  is_demo_source: boolean;
  /** Página do Notion a que o registro se refere (só de itens dentro do escopo). */
  external_id?: string | null;
  fields_changed?: string[] | null;
}

/** Entidades da integração. 'okrs' e 'reunioes' existem só em registros antigos da demonstração. */
export type NotionSyncEntity = 'tarefas' | 'krs' | 'objetivos';
export type ReviewKind = 'conflito' | 'kr_multiplos_objetivos' | 'kr_sem_objetivo' | 'valor_desconhecido' | 'instituicao' | 'reuniao_sem_data';
export type ReviewResolution = 'importado' | 'descartado' | 'manter_notion' | 'manter_central' | 'objetivo_escolhido';

export interface ReviewQueueItem extends BaseEntity {
  source: 'notion';
  entity: NotionSyncEntity | 'okrs' | 'reunioes';
  /** Motivo estruturado. Registros antigos sem este campo são tratados como 'instituicao' (legado). */
  kind: ReviewKind;
  external_id: string;
  title: string;
  payload: Record<string, unknown>;
  /** Explicação legível do motivo. */
  reason: string;
  resolved: boolean;
  resolution: ReviewResolution | null;
}

export type SyncStatus = 'ok' | 'pendente_push' | 'conflito' | 'revisao' | 'suspenso' | 'fora_do_escopo' | 'removido_no_notion' | 'removido_na_central';

/** Estado de sincronização de UMA página do Notion (tarefa, KR ou objetivo). */
export interface NotionSyncState extends BaseEntity {
  entity: NotionSyncEntity;
  /** Registro local. Para KR: id do KR dentro de objective.key_results. */
  local_id: string | null;
  /** KR: id do objective local que contém o KR. */
  local_parent_id: string | null;
  notion_page_id: string;
  /** KR: página do Objetivo (VISÃO) no Notion. */
  notion_parent_id: string | null;
  /** KR com vários Objetivos: Objetivo escolhido na revisão. */
  pinned_parent_id: string | null;
  synced_hash: string | null;
  synced_snapshot: Record<string, unknown> | null;
  last_notion_edited_time: string | null;
  last_central_updated_at: string | null;
  last_synced_at: string | null;
  last_change_origin: 'notion' | 'central' | null;
  echo_edited_time: string | null;
  sync_status: SyncStatus;
  write_count_window: number;
  write_window_started_at: string | null;
}

/** Configuração da integração (sem segredos — o token nunca fica aqui). */
export interface NotionConfig {
  person_id: string;
  person_name: string;
  tasks_data_source_id: string;
  krs_data_source_id: string;
  objectives_data_source_id: string;
  cursors: Partial<Record<NotionSyncEntity, string | null>>;
  last_sync_at: string | null;
}

/** Entradas manuais dos relatórios. 'prioridade' usa a segunda-feira da semana a que se refere. */
export type ReportEntryKind = 'conquista' | 'destaque' | 'pendencia' | 'anotacao' | 'prioridade';
export interface ReportEntry extends BaseEntity {
  date: string; // yyyy-mm-dd
  kind: ReportEntryKind;
  text: string;
  institution_id: ID | null;
}

export interface Settings extends BaseEntity {
  theme: 'dark' | 'light' | 'system';
  workday_start: string;
  workday_end: string;
  break_start: string;
  break_end: string;
  daily_minutes: number;
  weekly_minutes: number;
  categories: string[];
  weekly_focus: Record<string, string>; // "1".."5"
  notion_enabled: boolean;
  notion_write_enabled: boolean;
  /** Legado (mapeamento editável da demonstração). A integração usa os nomes fixos de integrations/notion/config.ts. */
  notion_mapping: Record<string, Record<string, string>>;
  /** Pode faltar em configurações salvas antes da migration 0002: use resolveNotionConfig(). */
  notion_config?: Partial<NotionConfig>;
  display_name: string;
  /** Logo personalizada: caminho no Storage (bucket "branding") ou data URL no modo local. null = monograma CP. */
  logo_path?: string | null;
  permissions: { feedbacks_restricted: boolean; feedback_pin: string };
}

export interface EntityMap {
  institutions: Institution;
  tasks: Task;
  routine_templates: RoutineTemplate;
  routine_blocks: RoutineBlock;
  agenda_events: AgendaEvent;
  notes: Note;
  people: Person;
  feedbacks: Feedback;
  candidates: Candidate;
  interviews: Interview;
  trainings: Training;
  meetings: Meeting;
  systems: SystemItem;
  improvements: Improvement;
  objectives: Objective;
  projects: Project;
  sync_logs: SyncLog;
  review_queue: ReviewQueueItem;
  notion_sync_state: NotionSyncState;
  report_entries: ReportEntry;
  settings: Settings;
}

export type Collection = keyof EntityMap;
export const COLLECTIONS: Collection[] = [
  'institutions', 'tasks', 'routine_templates', 'routine_blocks', 'agenda_events', 'notes',
  'people', 'feedbacks', 'candidates', 'interviews', 'trainings', 'meetings', 'systems',
  'improvements', 'objectives', 'projects', 'sync_logs', 'review_queue', 'notion_sync_state', 'report_entries', 'settings',
];
