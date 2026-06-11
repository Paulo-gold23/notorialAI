import { supabase } from './supabase';

/**
 * Admin Service Layer
 * All functions call Supabase RPC functions (SECURITY DEFINER)
 * that bypass RLS for admin-only operations.
 */

export async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_current_user_admin');
  if (error) {
    console.warn('Admin check failed:', error.message);
    return false;
  }
  return data === true;
}

export async function getAdminStats() {
  const { data, error } = await supabase.rpc('admin_get_enhanced_stats');
  if (error) throw new Error('Erro ao carregar estatísticas: ' + error.message);
  return data;
}

export async function listAdvogados() {
  const { data, error } = await supabase.rpc('admin_list_advogados');
  if (error) throw new Error('Erro ao listar advogados: ' + error.message);
  return data || [];
}

export async function updateAdvogadoStatus(targetId, newStatus) {
  const { error } = await supabase.rpc('admin_update_status', {
    target_id: targetId,
    new_status: newStatus,
  });
  if (error) throw new Error('Erro ao atualizar status: ' + error.message);
}

export async function deleteAdvogado(targetId) {
  const { error } = await supabase.rpc('admin_delete_advogado', {
    target_id: targetId,
  });
  if (error) throw new Error('Erro ao excluir advogado: ' + error.message);
}

export async function getRecentAtas(limit = 10) {
  const { data, error } = await supabase.rpc('admin_recent_atas', {
    limit_count: limit,
  });
  if (error) throw new Error('Erro ao carregar atas recentes: ' + error.message);
  return data || [];
}

export async function getAtasByWeek() {
  const { data, error } = await supabase.rpc('admin_atas_by_week');
  if (error) throw new Error('Erro ao carregar dados semanais: ' + error.message);
  return data || [];
}

export async function getAtasByStatus() {
  const { data, error } = await supabase.rpc('admin_atas_by_status');
  if (error) throw new Error('Erro ao carregar status das atas: ' + error.message);
  return data || [];
}

export async function adjustCredits(targetId, amount, description) {
  const { data, error } = await supabase.rpc('admin_adjust_credits', {
    target_id: targetId,
    amount_to_add: amount,
    p_description: description,
  });
  if (error) throw new Error('Erro ao ajustar créditos: ' + error.message);
  return data;
}

export async function getUserTransactions(targetId) {
  const { data, error } = await supabase.rpc('admin_get_user_transactions', {
    target_id: targetId,
  });
  if (error) throw new Error('Erro ao buscar transações do usuário: ' + error.message);
  return data || [];
}

