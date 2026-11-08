/**
 * Pré-carregamento de dados e telas.
 * - HOME_DATA: o que a tela inicial (Hoje) e o menu precisam — pedido em paralelo assim que a sessão existe.
 * - ROUTE_DATA: o que cada módulo lê. Pedido quando a pessoa APONTA para o item do menu (mouse, foco ou toque),
 *   então quando ela clica os dados normalmente já estão em memória (sem tela de "carregando").
 */
import type { Collection } from '@/domain/types';

export const HOME_DATA: readonly Collection[] = ['settings', 'institutions', 'tasks', 'routine_blocks', 'routine_templates', 'agenda_events', 'notes', 'meetings'];

export const ROUTE_DATA: Record<string, readonly Collection[]> = {
  '/': HOME_DATA,
  '/rotina': ['routine_blocks', 'routine_templates'],
  '/agenda': ['agenda_events', 'meetings'],
  '/tarefas': ['tasks', 'notion_sync_state', 'objectives'],
  '/equipes': ['people', 'feedbacks', 'person_metrics'],
  '/treinamentos': ['trainings', 'people'],
  '/reunioes': ['meetings'],
  '/okrs': ['objectives', 'notion_sync_state'],
  '/projetos': ['projects'],
  '/relatorios': ['tasks', 'routine_blocks', 'report_entries', 'objectives', 'notes'],
  '/integracoes': ['sync_logs', 'review_queue', 'notion_sync_state', 'tasks', 'objectives'],
  '/configuracoes': ['routine_templates', 'tasks'],
};
