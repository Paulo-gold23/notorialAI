import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Clock, FileText, FileCheck, AlertTriangle,
  CheckCircle, XCircle, Trash2, Search, ArrowLeft,
  LogOut, Shield, RefreshCw, UserCheck, MessageSquare,
  Mic, TrendingUp, Calendar, Activity, BarChart3
} from 'lucide-react';
import {
  getAdminStats,
  listAdvogados,
  updateAdvogadoStatus,
  deleteAdvogado,
  getRecentAtas,
  getAtasByWeek,
  getAtasByStatus,
} from '../services/adminApi';
import { supabase } from '../services/supabase';
import AnimatedNumber from '../components/AnimatedNumber';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../components/ToastContext';
import Logo from '../components/Logo';

/* ============================================
   COLOR CONSTANTS
   ============================================ */
const COLORS = {
  blue: '#3b82f6',
  amber: '#fbbf24',
  violet: '#8b5cf6',
  emerald: '#4ade80',
  red: '#f87171',
  cyan: '#22d3ee',
  orange: '#fb923c',
  rose: '#fb7185',
  sky: '#38bdf8',
};

const STATUS_BADGE = {
  pendente: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  aprovado: { bg: 'rgba(74,222,128,0.15)', text: '#4ade80', border: 'rgba(74,222,128,0.3)' },
  rejeitado: { bg: 'rgba(248,113,113,0.15)', text: '#f87171', border: 'rgba(248,113,113,0.3)' },
};

const ATA_STATUS_MAP = {
  ready: { label: 'Pronta', color: '#4ade80' },
  error: { label: 'Erro', color: '#f87171' },
  uploading: { label: 'Enviando', color: '#fbbf24' },
  parsing: { label: 'Parseando', color: '#fb923c' },
  transcribing: { label: 'Transcrevendo', color: '#818cf8' },
  organizing: { label: 'Organizando', color: '#38bdf8' },
};

/* ============================================
   MAIN COMPONENT
   ============================================ */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [advogados, setAdvogados] = useState([]);
  const [recentAtas, setRecentAtas] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null, nome: '' });

  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [s, adv, atas, weekly, byStatus] = await Promise.all([
        getAdminStats(),
        listAdvogados(),
        getRecentAtas(15),
        getAtasByWeek().catch(() => []),
        getAtasByStatus().catch(() => []),
      ]);
      setStats(s);
      setAdvogados(adv);
      setRecentAtas(atas);
      setWeeklyData(weekly);
      setStatusData(byStatus);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
    toast.success('Dados atualizados.');
  };

  const handleApprove = async (id, nome) => {
    try {
      await updateAdvogadoStatus(id, 'aprovado');
      toast.success(`${nome} aprovado com sucesso.`);
      await loadAll();
    } catch (err) { toast.error(err.message); }
  };

  const handleReject = async (id, nome) => {
    try {
      await updateAdvogadoStatus(id, 'rejeitado');
      toast.success(`${nome} rejeitado.`);
      await loadAll();
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteClick = (id, nome) => {
    setConfirmModal({ isOpen: true, id, nome });
  };

  const confirmDelete = async () => {
    const { id, nome } = confirmModal;
    setConfirmModal({ isOpen: false, id: null, nome: '' });
    try {
      await deleteAdvogado(id);
      toast.success(`${nome} e todos os dados excluídos.`);
      await loadAll();
    } catch (err) { toast.error(err.message); }
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch (_) {}
    window.location.reload();
  };

  const pendentes = advogados.filter(a => a.status === 'pendente');
  const filteredAdvogados = advogados.filter(a =>
    (a.nome || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="sp-wave" style={{ width: 32, height: 32 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando painel administrativo...</span>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ minHeight: '100vh', background: 'var(--bg-color)' }}>
      {/* Top Bar */}
      <div style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--panel-bg)',
        padding: '0.75rem 1.5rem',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Logo size={30} />
            <h1 className="font-serif" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Notorial.ai
            </h1>
            <span style={{
              background: 'linear-gradient(135deg, var(--gold-from), var(--gold-to))',
              color: '#0f172a', padding: '0.15rem 0.5rem', borderRadius: '9999px',
              fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em',
            }}>ADMIN</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={handleRefresh} className="btn-ghost" disabled={refreshing} title="Atualizar">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => navigate('/')} className="btn-ghost" title="Voltar ao app">
              <ArrowLeft size={16} /> <span style={{ fontSize: '0.8rem' }}>App</span>
            </button>
            <button onClick={handleLogout} className="btn-ghost" title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1.5rem' }}>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
          {[
            { key: 'overview', label: 'Visão Geral', icon: BarChart3 },
            { key: 'users', label: 'Usuários', icon: Users },
            { key: 'activity', label: 'Atividade', icon: Activity },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.65rem 1.1rem',
                fontSize: '0.825rem', fontWeight: 500,
                color: activeTab === tab.key ? 'var(--primary-color)' : 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab.key ? 'var(--primary-color)' : 'transparent'}`,
                transition: 'all 0.2s',
                marginBottom: '-1px',
              }}
            >
              <tab.icon size={16} /> {tab.label}
              {tab.key === 'users' && pendentes.length > 0 && (
                <span style={{
                  background: '#fbbf24', color: '#0f172a',
                  fontSize: '0.6rem', fontWeight: 800, borderRadius: '9999px',
                  padding: '0.1rem 0.4rem', minWidth: '16px', textAlign: 'center',
                }}>
                  {pendentes.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* === OVERVIEW TAB === */}
        {activeTab === 'overview' && stats && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
            {/* Primary Metrics Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
              <StatCard icon={Users} label="Advogados" value={stats.total_advogados} color={COLORS.blue} sub={`${stats.registros_este_mes} este mês`} delay={0} />
              <StatCard icon={Clock} label="Pendentes" value={stats.advogados_pendentes} color={COLORS.amber} highlight={stats.advogados_pendentes > 0} sub={stats.advogados_pendentes > 0 ? 'Ação necessária' : 'Nenhum'} delay={50} />
              <StatCard icon={FileText} label="Total Atas" value={stats.total_atas} color={COLORS.violet} sub={`${stats.atas_este_mes} este mês`} delay={100} />
              <StatCard icon={FileCheck} label="Concluídas" value={stats.atas_prontas} color={COLORS.emerald} sub={stats.total_atas > 0 ? `${Math.round(stats.atas_prontas/stats.total_atas*100)}% taxa sucesso` : '—'} delay={150} />
            </div>

            {/* Secondary Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
              <MiniStat icon={MessageSquare} label="Mensagens Processadas" value={stats.total_mensagens_processadas} />
              <MiniStat icon={Mic} label="Áudios Transcritos" value={stats.total_audios_transcritos} />
              <MiniStat icon={AlertTriangle} label="Atas com Erro" value={stats.atas_erro} danger={stats.atas_erro > 0} />
              <MiniStat icon={TrendingUp} label="Processando Agora" value={stats.atas_processando} />
            </div>

            {/* Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Weekly Bar Chart */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={16} style={{ color: COLORS.blue }} /> Atas por Semana
                </h3>
                <WeeklyBarChart data={weeklyData} />
              </div>

              {/* Status Donut Chart */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={16} style={{ color: COLORS.violet }} /> Distribuição por Status
                </h3>
                <DonutChart data={statusData} />
              </div>
            </div>

            {/* Quick: Recent Activity on Overview */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} style={{ color: COLORS.emerald }} /> Últimas Atas
              </h3>
              {recentAtas.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Nenhuma ata processada ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {recentAtas.slice(0, 5).map((ata, i) => {
                    const st = ATA_STATUS_MAP[ata.status] || ATA_STATUS_MAP.error;
                    return (
                      <div key={ata.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
                        background: 'var(--bg-color)', fontSize: '0.825rem',
                        animation: `slideUp 0.3s ease-out ${i * 40}ms both`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-main)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ata.titulo || 'Sem título'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span>{ata.advogado_nome}</span>
                          <span>{new Date(ata.created_at).toLocaleDateString('pt-BR')}</span>
                          <span style={{ color: st.color, fontWeight: 600, fontSize: '0.7rem' }}>{st.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === USERS TAB === */}
        {activeTab === 'users' && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
            {/* Pending Approvals */}
            {pendentes.length > 0 && (
              <section style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#fbbf24',
                    animation: 'breathe 1.5s ease-in-out infinite',
                    boxShadow: '0 0 8px rgba(251,191,36,0.5)',
                  }} />
                  <h2 className="font-serif" style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-main)' }}>
                    Pendentes de Aprovação ({pendentes.length})
                  </h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {pendentes.map((adv, i) => (
                    <div key={adv.id} className="card" style={{
                      borderColor: 'rgba(251,191,36,0.25)',
                      animation: `slideUp 0.4s ease-out ${i * 80}ms both`,
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span className="font-serif" style={{ fontWeight: 600, color: 'var(--text-main)' }}>{adv.nome}</span>
                            <StatusBadge status="pendente" />
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <span>{adv.email}</span>
                            {adv.oab && <span>OAB: {adv.oab}</span>}
                            <span>{new Date(adv.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <ActionBtn color={COLORS.emerald} onClick={() => handleApprove(adv.id, adv.nome)}>
                            <CheckCircle size={15} /> Aprovar
                          </ActionBtn>
                          <ActionBtn color={COLORS.red} onClick={() => handleReject(adv.id, adv.nome)}>
                            <XCircle size={15} /> Rejeitar
                          </ActionBtn>
                          <ActionBtn color="var(--text-muted)" ghost onClick={() => handleDeleteClick(adv.id, adv.nome)}>
                            <Trash2 size={15} />
                          </ActionBtn>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Info banner when no pendentes */}
            {pendentes.length === 0 && (
              <div style={{
                background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.5rem',
                display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem', color: COLORS.emerald,
              }}>
                <CheckCircle size={18} />
                <span>Todos os advogados estão aprovados. Novos cadastros aparecerão aqui para aprovação.</span>
              </div>
            )}

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Buscar por nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-login"
                style={{ paddingLeft: '2.5rem', fontSize: '0.85rem', padding: '0.6rem 1rem 0.6rem 2.5rem' }}
              />
            </div>

            {/* Advogados Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 0.8fr 1fr 0.5fr',
                padding: '0.7rem 1.2rem', background: 'var(--bg-color)',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', gap: '0.5rem',
              }}>
                <span>Nome</span><span>Email</span><span>OAB</span><span>Atas</span><span>Status</span><span></span>
              </div>
              {filteredAdvogados.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum advogado registrado.'}
                </div>
              ) : filteredAdvogados.map((adv, i) => (
                <div key={adv.id} style={{
                  display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 0.8fr 1fr 0.5fr',
                  padding: '0.8rem 1.2rem',
                  borderBottom: i < filteredAdvogados.length - 1 ? '1px solid var(--border-color)' : 'none',
                  fontSize: '0.825rem', alignItems: 'center', gap: '0.5rem',
                  transition: 'background-color 0.15s',
                  cursor: 'default',
                }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-color)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span style={{ color: 'var(--text-main)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {adv.nome}
                    {adv.is_admin && <Shield size={13} style={{ color: 'var(--gold-to)', flexShrink: 0 }} title="Admin" />}
                  </span>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{adv.email}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{adv.oab || '—'}</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{adv.total_atas}</span>
                  <StatusBadge status={adv.status} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {!adv.is_admin && (
                      <button onClick={() => handleDeleteClick(adv.id, adv.nome)}
                        style={{ background: 'none', border: 'none', padding: '0.3rem', cursor: 'pointer', color: 'var(--text-muted)', transition: 'color 0.2s', borderRadius: '0.25rem' }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--danger)'}
                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                        title="Excluir conta"
                      ><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === ACTIVITY TAB === */}
        {activeTab === 'activity' && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
            <h2 className="font-serif" style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: '0 0 1rem' }}>
              Timeline de Atividade
            </h2>
            {recentAtas.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Nenhuma ata processada ainda.
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                {/* Timeline line */}
                <div style={{
                  position: 'absolute', left: '0.45rem', top: '0.5rem', bottom: '0.5rem',
                  width: '2px', background: 'var(--border-color)',
                }} />
                {recentAtas.map((ata, i) => {
                  const st = ATA_STATUS_MAP[ata.status] || ATA_STATUS_MAP.error;
                  return (
                    <div key={ata.id} style={{
                      position: 'relative', marginBottom: '0.75rem',
                      animation: `slideUp 0.4s ease-out ${i * 50}ms both`,
                    }}>
                      {/* Dot */}
                      <div style={{
                        position: 'absolute', left: '-1.65rem', top: '1.1rem',
                        width: 10, height: 10, borderRadius: '50%',
                        background: st.color, border: '2px solid var(--panel-bg)',
                        boxShadow: `0 0 6px ${st.color}40`,
                      }} />
                      <div className="card" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                              {ata.titulo || 'Ata sem título'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Users size={12} /> {ata.advogado_nome}
                              </span>
                              {ata.total_mensagens > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <MessageSquare size={12} /> {ata.total_mensagens} msgs
                                </span>
                              )}
                              {ata.total_audios > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Mic size={12} /> {ata.total_audios} áudios
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {new Date(ata.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            <span style={{
                              background: `${st.color}20`, color: st.color,
                              padding: '0.2rem 0.6rem', borderRadius: '9999px',
                              fontSize: '0.68rem', fontWeight: 600,
                            }}>{st.label}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, id: null, nome: '' })}
        onConfirm={confirmDelete}
        title="Excluir Advogado"
        message={`Tem certeza que deseja excluir "${confirmModal.nome}" e TODOS os dados (atas, PDFs)? Esta ação é irreversível.`}
        confirmText="Excluir Permanentemente"
        variant="danger"
      />
    </div>
  );
}

/* ============================================
   SVG CHARTS
   ============================================ */

function WeeklyBarChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyChart message="Sem dados de atas semanais" />;
  }

  const max = Math.max(...data.map(d => Number(d.total)), 1);
  const barH = 140;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.35rem', height: barH + 30 }}>
      {data.map((d, i) => {
        const h = (Number(d.total) / max) * barH;
        const minH = Number(d.total) > 0 ? Math.max(h, 6) : 3;
        return (
          <div key={i} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem',
          }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-main)', fontWeight: 600 }}>
              {Number(d.total) > 0 ? d.total : ''}
            </span>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '70%', height: minH, borderRadius: '0.25rem 0.25rem 0 0',
                background: Number(d.total) > 0
                  ? `linear-gradient(180deg, ${COLORS.blue}, ${COLORS.violet})`
                  : 'var(--border-color)',
                transition: 'height 0.6s ease-out',
                animation: `slideUp 0.5s ease-out ${i * 60}ms both`,
              }} />
            </div>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{d.week_label}</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyChart message="Sem dados de status" />;
  }

  const total = data.reduce((a, d) => a + Number(d.total), 0);
  const radius = 60;
  const stroke = 14;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const STATUS_CHART_COLORS = {
    ready: COLORS.emerald,
    error: COLORS.red,
    uploading: COLORS.amber,
    parsing: COLORS.orange,
    transcribing: COLORS.sky,
    organizing: COLORS.cyan,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'center' }}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        {data.map((d, i) => {
          const pct = Number(d.total) / total;
          const dashLength = pct * circumference;
          const offset = cumulativeOffset;
          cumulativeOffset += dashLength;
          const color = STATUS_CHART_COLORS[d.status] || '#64748b';
          return (
            <circle key={i}
              cx="75" cy="75" r={radius}
              fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              transform="rotate(-90 75 75)"
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          );
        })}
        <text x="75" y="72" textAnchor="middle" fill="var(--text-main)" fontSize="22" fontWeight="700">{total}</text>
        <text x="75" y="90" textAnchor="middle" fill="var(--text-muted)" fontSize="10">total atas</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {data.map((d, i) => {
          const color = STATUS_CHART_COLORS[d.status] || '#64748b';
          const label = ATA_STATUS_MAP[d.status]?.label || d.status;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ color: 'var(--text-main)', fontWeight: 600, marginLeft: 'auto' }}>{d.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div style={{
      height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed var(--border-color)',
      borderRadius: '0.5rem',
    }}>
      {message}
    </div>
  );
}

/* ============================================
   SUB-COMPONENTS
   ============================================ */

function StatCard({ icon: Icon, label, value, color, sub, delay = 0, highlight = false }) {
  return (
    <div className="card" style={{
      padding: '1.1rem',
      animation: `slideUp 0.4s ease-out ${delay}ms both`,
      borderColor: highlight ? `${color}50` : undefined,
      position: 'relative', overflow: 'hidden',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animation: 'breathe 2s ease-in-out infinite',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '0.6rem',
          background: `${color}15`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={19} style={{ color }} />
        </div>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.1 }}>
            <AnimatedNumber value={value} />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{label}</div>
        </div>
      </div>
      {sub && (
        <div style={{
          fontSize: '0.68rem', color: highlight ? color : 'var(--text-dimmed)',
          marginTop: '0.6rem', paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-color)',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, danger = false }) {
  return (
    <div style={{
      background: 'var(--panel-bg)', border: '1px solid var(--border-color)',
      borderRadius: '0.6rem', padding: '0.8rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.6rem',
      animation: 'fadeSlideIn 0.4s ease-out both',
    }}>
      <Icon size={16} style={{ color: danger ? COLORS.red : 'var(--text-muted)', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: danger ? COLORS.red : 'var(--text-main)', lineHeight: 1 }}>
          <AnimatedNumber value={value} />
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pendente;
  const label = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' }[status] || status;
  return (
    <span style={{
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      padding: '0.18rem 0.55rem', borderRadius: '9999px',
      fontSize: '0.68rem', fontWeight: 600,
    }}>{label}</span>
  );
}

function ActionBtn({ color, ghost, onClick, children }) {
  const baseStyle = ghost ? {
    background: 'transparent', color, border: '1px solid var(--border-color)',
  } : {
    background: `${color}18`, color, border: `1px solid ${color}40`,
  };
  return (
    <button onClick={onClick} style={{
      ...baseStyle,
      display: 'flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.4rem 0.8rem', borderRadius: '0.4rem',
      fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
      transition: 'all 0.2s',
    }}
      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; if (!ghost) e.currentTarget.style.background = `${color}28`; }}
      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; if (!ghost) e.currentTarget.style.background = `${color}18`; }}
    >{children}</button>
  );
}
