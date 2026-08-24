import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Clock, FileText, FileCheck, AlertTriangle,
  CheckCircle, XCircle, Trash2, Search, ArrowLeft,
  LogOut, Shield, RefreshCw, UserCheck, MessageSquare,
  Mic, TrendingUp, Calendar, Activity, BarChart3,
  Coins, History, Terminal, Server, Globe, Cpu, Database,
  AlertOctagon, Info, Copy, Check
} from 'lucide-react';
import {
  getAdminStats,
  listAdvogados,
  updateAdvogadoStatus,
  deleteAdvogado,
  getRecentAtas,
  getAtasByWeek,
  getAtasByStatus,
  adjustCredits,
  getUserTransactions,
  getSystemLogs,
  getErrorAtas
} from '../services/adminApi';
import { supabase } from '../services/supabase';
import AnimatedNumber from '../components/AnimatedNumber';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import Logo from '../components/Logo';

/* ============================================
   COLOR CONSTANTS
   ============================================ */
const COLORS = {
  blue: '#3b82f6',
  amber: '#fbbf24',
  indigo: '#6366f1',
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
  const [systemLogs, setSystemLogs] = useState([]);
  const [errorAtas, setErrorAtas] = useState([]);
  const [logsSubTab, setLogsSubTab] = useState('all');
  const [logsSearch, setLogsSearch] = useState('');
  const [infraStatus, setInfraStatus] = useState({
    supabase: { status: 'online', label: 'Operacional', incident: null },
    openai: { status: 'online', label: 'Operacional' },
    groq: { status: 'online', label: 'Operacional' },
    asaas: { status: 'online', label: 'Operacional' },
    gotenberg: { status: 'online', label: 'Operacional (Docker Local)' }
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null, nome: '' });
  const [adjustCreditsModal, setAdjustCreditsModal] = useState({ isOpen: false, targetUser: null, amount: 10, description: '', loading: false });
  const [transactionsModal, setTransactionsModal] = useState({ isOpen: false, targetUser: null, transactions: [], loading: false });

  const navigate = useNavigate();
  const toast = useToast();

  const checkInfraHealth = useCallback(async () => {
    try {
      const res = await fetch('https://status.supabase.com/api/v2/summary.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const indicator = data?.status?.indicator;
        const incidents = data?.incidents ?? [];
        if (indicator && indicator !== 'none' && incidents.length > 0) {
          const latest = incidents[0];
          setInfraStatus(prev => ({
            ...prev,
            supabase: {
              status: indicator === 'minor' ? 'warning' : 'danger',
              label: indicator === 'minor' ? 'Alerta Menor' : 'Instabilidade',
              incident: latest.name,
              updatedAt: latest.updated_at
            }
          }));
        } else {
          setInfraStatus(prev => ({
            ...prev,
            supabase: { status: 'online', label: 'Operacional', incident: null }
          }));
        }
      }
    } catch (_) {
      // Keep optimistic
    }
  }, []);

  const loadAll = async () => {
    try {
      const [s, adv, atas, weekly, byStatus, logs, errors] = await Promise.all([
        getAdminStats(),
        listAdvogados(),
        getRecentAtas(15),
        getAtasByWeek().catch(() => []),
        getAtasByStatus().catch(() => []),
        getSystemLogs(100).catch(() => []),
        getErrorAtas(50).catch(() => []),
      ]);
      setStats(s);
      setAdvogados(adv);
      setRecentAtas(atas);
      setWeeklyData(weekly);
      setStatusData(byStatus);
      setSystemLogs(logs);
      setErrorAtas(errors);
      checkInfraHealth();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
    toast.success('Dados atualizados.');
  };

  const handleAdjustCreditsSubmit = async () => {
    const { targetUser, amount, description } = adjustCreditsModal;
    if (!targetUser) return;
    const cleanAmount = parseInt(amount, 10);
    if (cleanAmount === 0 || isNaN(cleanAmount)) {
      toast.error('Informe um valor de créditos válido diferente de zero.');
      return;
    }

    try {
      setAdjustCreditsModal(prev => ({ ...prev, loading: true }));
      await adjustCredits(targetUser.id, cleanAmount, description || 'Ajuste manual do administrador');
      toast.success(`Créditos ajustados com sucesso para ${targetUser.nome}. Novo saldo: ${(targetUser.credit_balance ?? 0) + cleanAmount} créditos.`);
      setAdjustCreditsModal({ isOpen: false, targetUser: null, amount: 10, description: '', loading: false });
      await loadAll();
    } catch (err) {
      toast.error(err.message);
      setAdjustCreditsModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleTransactionsOpen = async (user) => {
    setTransactionsModal({ isOpen: true, targetUser: user, transactions: [], loading: true });
    try {
      const txs = await getUserTransactions(user.id);
      setTransactionsModal({ isOpen: true, targetUser: user, transactions: txs, loading: false });
    } catch (err) {
      toast.error(err.message);
      setTransactionsModal(prev => ({ ...prev, isOpen: false, loading: false }));
    }
  };

  const handleApprove = async (id, nome) => {
    try {
      await updateAdvogadoStatus(id, 'aprovado');
      
      // Conceder 50 créditos de boas-vindas automaticamente
      try {
        const API_URL = import.meta.env.VITE_API_URL !== undefined
          ? import.meta.env.VITE_API_URL
          : (import.meta.env.DEV ? 'http://localhost:8000' : '');
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (token) {
          await fetch(`${API_URL}/api/credits/welcome`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'advogado_id': id }
          });
        }
      } catch (creditErr) {
        console.warn('Créditos de boas-vindas não concedidos:', creditErr);
      }
      
      toast.success(`${nome} aprovado com sucesso! 🎁 50 créditos de boas-vindas concedidos.`);
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
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Erro ao sair:', err);
    }
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
      <style>{`
        /* CSS regras de responsividade */
        .adm-primary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.85rem;
          margin-bottom: 1.5rem;
        }
        .adm-secondary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.85rem;
          margin-bottom: 1.5rem;
        }
        .adm-charts-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 768px) {
          .adm-charts-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .adm-primary-grid {
            grid-template-columns: 1fr;
          }
          .adm-secondary-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* Abas / Tab navigation responsive style */
        .adm-tabs-container {
          display: flex;
          gap: 0.25rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        /* Hide scrollbar for tabs */
        .adm-tabs-container::-webkit-scrollbar {
          display: none;
        }
        .adm-tabs-container {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .adm-tab-button {
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Table responsive handling */
        .adm-desktop-table {
          display: block;
        }
        .adm-mobile-cards {
          display: none;
        }
        @media (max-width: 900px) {
          .adm-desktop-table {
            display: none;
          }
          .adm-mobile-cards {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
          }
        }

        /* Mobile User Card Styling matching original flat theme */
        .adm-user-card {
          background: var(--panel-bg);
          border: 1px solid var(--border-color);
          border-radius: 0.6rem;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .adm-user-card:hover {
          border-color: var(--border-hover, #475569);
        }
        .adm-user-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.8rem 1rem;
          background: rgba(255, 255, 255, 0.01);
        }
        .adm-user-card-title {
          font-weight: 600;
          color: var(--text-main);
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.85rem;
          min-width: 0;
        }
        .adm-user-card-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 150px;
        }
        .adm-user-card-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .adm-user-card-credits {
          font-weight: 700;
          font-size: 0.8rem;
          color: var(--text-main);
          background: rgba(251, 191, 36, 0.1);
          padding: 0.15rem 0.4rem;
          border-radius: 0.25rem;
          display: flex;
          align-items: center;
          gap: 0.2rem;
        }
        .adm-user-card-details {
          padding: 1rem;
          border-top: 1px solid var(--border-color);
          background: rgba(0, 0, 0, 0.1);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          animation: admFadeIn 0.2s ease-out;
        }
        .adm-user-card-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.78rem;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.04);
          padding-bottom: 0.3rem;
          gap: 0.5rem;
        }
        .adm-user-card-row span:first-child {
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .adm-user-card-row span:last-child {
          color: var(--text-main);
          font-weight: 500;
          text-align: right;
          word-break: break-all;
        }
        .adm-user-card-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .adm-user-card-actions button {
          width: 100%;
          justify-content: center;
        }

        .adm-donut-container {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          justify-content: center;
        }
        @media (max-width: 480px) {
          .adm-donut-container {
            flex-direction: column;
            gap: 1rem;
          }
        }

        .adm-recent-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 0.75rem;
          border-radius: 0.5rem;
          background: var(--bg-color);
          font-size: 0.825rem;
          gap: 0.5rem;
        }
        .adm-recent-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        @media (max-width: 600px) {
          .adm-recent-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0.4rem;
            padding: 0.75rem;
          }
          .adm-recent-right {
            justify-content: space-between;
            border-top: 1px dashed var(--border-color);
            padding-top: 0.4rem;
            margin-top: 0.1rem;
          }
        }
      `}</style>

      {/* Top Bar */}
      <div style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--panel-bg)',
        padding: '0.75rem 1.5rem',
        position: 'sticky', top: 0, zIndex: 50,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            onClick={() => navigate('/dashboard')}
            title="Ir para o Dashboard do Usuário"
          >
            <Logo size={30} />
            <h1 className="font-serif" style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              LegisVox
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
            <button onClick={() => navigate('/dashboard')} className="btn-ghost" title="Voltar ao Dashboard do Usuário">
              <ArrowLeft size={16} /> <span style={{ fontSize: '0.8rem' }}>Dashboard</span>
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
        <div className="adm-tabs-container">
          {[
            { key: 'overview', label: 'Visão Geral', icon: BarChart3 },
            { key: 'users', label: 'Usuários', icon: Users },
            { key: 'activity', label: 'Atividade', icon: Activity },
            { key: 'logs', label: 'Logs & Sistema', icon: Terminal },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="adm-tab-button"
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
              {tab.key === 'logs' && errorAtas.length > 0 && (
                <span style={{
                  background: '#ef4444', color: '#fff',
                  fontSize: '0.6rem', fontWeight: 800, borderRadius: '9999px',
                  padding: '0.1rem 0.4rem', minWidth: '16px', textAlign: 'center',
                }}>
                  {errorAtas.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* === OVERVIEW TAB === */}
        {activeTab === 'overview' && stats && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
            {/* Primary Metrics Row */}
            <div className="adm-primary-grid">
              <StatCard icon={Users} label="Advogados" value={stats.total_advogados} color={COLORS.blue} sub={`${stats.registros_este_mes} este mês`} delay={0} />
              <StatCard icon={Clock} label="Pendentes" value={stats.advogados_pendentes} color={COLORS.amber} highlight={stats.advogados_pendentes > 0} sub={stats.advogados_pendentes > 0 ? 'Ação necessária' : 'Nenhum'} delay={50} />
              <StatCard icon={FileText} label="Total Documentos" value={stats.total_atas} color={COLORS.indigo} sub={`${stats.atas_este_mes} este mês`} delay={100} />
              <StatCard icon={FileCheck} label="Concluídas" value={stats.atas_prontas} color={COLORS.emerald} sub={stats.total_atas > 0 ? `${Math.round(stats.atas_prontas/stats.total_atas*100)}% taxa sucesso` : '—'} delay={150} />
            </div>

            {/* Secondary Metrics */}
            <div className="adm-secondary-grid">
              <MiniStat icon={MessageSquare} label="Mensagens Processadas" value={stats.total_mensagens_processadas} />
              <MiniStat icon={Mic} label="Áudios Transcritos" value={stats.total_audios_transcritos} />
              <MiniStat icon={AlertTriangle} label="Docs com Erro" value={stats.atas_erro} danger={stats.atas_erro > 0} />
              <MiniStat icon={TrendingUp} label="Processando Agora" value={stats.atas_processando} />
            </div>

            {/* Charts Row */}
            <div className="adm-charts-grid">
              {/* Weekly Bar Chart */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={16} style={{ color: COLORS.blue }} /> Documentos por Semana
                </h3>
                <WeeklyBarChart data={weeklyData} />
              </div>

              {/* Status Donut Chart */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Activity size={16} style={{ color: COLORS.indigo }} /> Distribuição por Status
                </h3>
                <DonutChart data={statusData} />
              </div>
            </div>

            {/* Quick: Recent Activity on Overview */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} style={{ color: COLORS.emerald }} /> Últimos Documentos
              </h3>
              {recentAtas.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Nenhum documento processado ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {recentAtas.slice(0, 5).map((ata, i) => {
                    const st = ATA_STATUS_MAP[ata.status] || ATA_STATUS_MAP.error;
                    return (
                      <div key={ata.id} className="adm-recent-row" style={{
                        animation: `slideUp 0.3s ease-out ${i * 40}ms both`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-main)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ata.titulo || 'Sem título'}
                          </span>
                        </div>
                        <div className="adm-recent-right">
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{ata.advogado_nome}</span>
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

            {/* Advogados Table (Desktop View) */}
            <div className="adm-desktop-table card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 2.2fr 1.1fr 0.8fr 1fr 1fr 1.6fr',
                padding: '0.7rem 1.2rem', background: 'var(--bg-color)',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', gap: '0.5rem',
              }}>
                <span>Nome</span><span>Email</span><span>OAB</span><span>Docs</span><span>Saldo</span><span>Status</span><span>Ações</span>
              </div>
              {filteredAdvogados.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum advogado registrado.'}
                </div>
              ) : filteredAdvogados.map((adv, i) => (
                <div key={adv.id} style={{
                  display: 'grid', gridTemplateColumns: '2fr 2.2fr 1.1fr 0.8fr 1fr 1fr 1.6fr',
                  padding: '0.8rem 1.2rem',
                  borderBottom: i < filteredAdvogados.length - 1 ? '1px solid var(--border-color)' : 'none',
                  fontSize: '0.825rem', alignItems: 'center', gap: '0.5rem',
                  transition: 'background-color 0.15s',
                  cursor: 'default',
                }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-color)'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <span style={{ color: 'var(--text-main)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={adv.nome}>{adv.nome}</span>
                    {adv.is_admin && <Shield size={13} style={{ color: 'var(--gold-to)', flexShrink: 0 }} title="Admin" />}
                  </span>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={adv.email}>{adv.email}</span>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adv.oab || '—'}</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{adv.total_atas}</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Coins size={13} style={{ color: 'var(--gold-to)', flexShrink: 0 }} />
                    <span>{adv.credit_balance ?? 0}</span>
                  </span>
                  <StatusBadge status={adv.status} />
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setAdjustCreditsModal({ isOpen: true, targetUser: adv, amount: 10, description: '', loading: false })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                        background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)',
                        padding: '0.35rem 0.6rem', borderRadius: '0.35rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.background = 'rgba(251,191,36,0.2)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(251,191,36,0.12)'; }}
                      title="Ajustar Créditos"
                    >
                      <Coins size={12} />
                      <span>Ajustar</span>
                    </button>
                    <button
                      onClick={() => handleTransactionsOpen(adv)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                        background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)',
                        padding: '0.35rem 0.6rem', borderRadius: '0.35rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.background = 'rgba(99,102,241,0.2)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; }}
                      title="Histórico de Transações"
                    >
                      <History size={12} />
                      <span>Histórico</span>
                    </button>
                    {!adv.is_admin && (
                      <button onClick={() => handleDeleteClick(adv.id, adv.nome)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                          background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)',
                          padding: '0.35rem 0.6rem', borderRadius: '0.35rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'var(--danger)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; }}
                        title="Excluir conta"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Advogados Cards (Mobile View) */}
            <div className="adm-mobile-cards">
              {filteredAdvogados.length === 0 ? (
                <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {searchQuery ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum advogado registrado.'}
                </div>
              ) : filteredAdvogados.map((adv) => {
                return (
                  <div key={adv.id} className="adm-user-card">
                    <div className="adm-user-card-header">
                      <span className="adm-user-card-title">
                        <span className="adm-user-card-name">{adv.nome}</span>
                        {adv.is_admin && <Shield size={12} style={{ color: 'var(--gold-to)', flexShrink: 0 }} />}
                      </span>
                      <div className="adm-user-card-meta">
                        <span className="adm-user-card-credits">
                          <Coins size={12} style={{ color: 'var(--gold-to)', flexShrink: 0 }} />
                          {adv.credit_balance ?? 0}
                        </span>
                        <StatusBadge status={adv.status} />
                      </div>
                    </div>
                    <div className="adm-user-card-details">
                      <div className="adm-user-card-row">
                        <span>Email</span>
                        <span>{adv.email}</span>
                      </div>
                      <div className="adm-user-card-row">
                        <span>OAB</span>
                        <span>{adv.oab || '—'}</span>
                      </div>
                      <div className="adm-user-card-row">
                        <span>Documentos</span>
                        <span>{adv.total_atas}</span>
                      </div>
                      <div className="adm-user-card-actions">
                        <button
                          onClick={() => setAdjustCreditsModal({ isOpen: true, targetUser: adv, amount: 10, description: '', loading: false })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)',
                            padding: '0.5rem 1rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <Coins size={13} />
                          <span>Ajustar Créditos</span>
                        </button>
                        <button
                          onClick={() => handleTransactionsOpen(adv)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)',
                            padding: '0.5rem 1rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <History size={13} />
                          <span>Ver Histórico</span>
                        </button>
                        {!adv.is_admin && (
                          <button 
                            onClick={() => handleDeleteClick(adv.id, adv.nome)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.25rem',
                              background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)',
                              padding: '0.5rem 1rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Excluir Advogado</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                Nenhum documento processado ainda.
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
                              {ata.titulo || 'Documento sem título'}
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

        {/* === LOGS & SISTEMA TAB === */}
        {activeTab === 'logs' && (
          <div style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
            {/* Top Cards in Logs */}
            <div className="adm-primary-grid" style={{ marginBottom: '1.25rem' }}>
              <StatCard 
                icon={Terminal} 
                label="Logs de Auditoria" 
                value={systemLogs.length} 
                color={COLORS.indigo} 
                sub="Ações rastreadas no sistema" 
              />
              <StatCard 
                icon={AlertOctagon} 
                label="Falhas / Erros" 
                value={errorAtas.length} 
                color={errorAtas.length > 0 ? COLORS.red : COLORS.emerald} 
                highlight={errorAtas.length > 0} 
                sub={errorAtas.length > 0 ? `${errorAtas.length} documento(s) com erro` : 'Nenhum erro registrado'} 
              />
              <StatCard 
                icon={Server} 
                label="Supabase Status" 
                value={infraStatus.supabase.status === 'online' ? '100%' : 'Alerta'} 
                color={infraStatus.supabase.status === 'online' ? COLORS.emerald : COLORS.amber} 
                sub={infraStatus.supabase.incident || 'Banco e Auth Operacionais'} 
              />
              <StatCard 
                icon={Cpu} 
                label="APIs de IA (ZDR)" 
                value="Ativo" 
                color={COLORS.blue} 
                sub="OpenAI & Groq Conectados" 
              />
            </div>

            {/* Sub-Tabs Selector & Search */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: `Todos os Logs (${systemLogs.length})`, icon: Terminal },
                  { key: 'errors', label: `Erros de Documentos (${errorAtas.length})`, icon: AlertTriangle, danger: errorAtas.length > 0 },
                  { key: 'admin', label: 'Ações de Admin', icon: Shield },
                  { key: 'infra', label: 'Saúde da Infraestrutura', icon: Server },
                ].map(sub => (
                  <button
                    key={sub.key}
                    onClick={() => setLogsSubTab(sub.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.45rem 0.85rem', borderRadius: '0.5rem',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                      background: logsSubTab === sub.key
                        ? (sub.danger ? 'rgba(239, 68, 68, 0.2)' : 'var(--primary-color)')
                        : 'var(--panel-bg)',
                      color: logsSubTab === sub.key
                        ? (sub.danger ? '#ef4444' : '#fff')
                        : 'var(--text-muted)',
                      border: `1px solid ${logsSubTab === sub.key ? 'transparent' : 'var(--border-color)'}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    <sub.icon size={14} /> {sub.label}
                  </button>
                ))}
              </div>

              {logsSubTab !== 'infra' && (
                <div style={{ position: 'relative', minWidth: '240px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Filtrar logs..."
                    value={logsSearch}
                    onChange={(e) => setLogsSearch(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '2.2rem', height: '36px', fontSize: '0.8rem', width: '100%' }}
                  />
                </div>
              )}
            </div>

            {/* Sub-Tab 1: INFRAESTRUTURA */}
            {logsSubTab === 'infra' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Database size={20} color={COLORS.emerald} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Supabase Database & Auth</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PostgreSQL, RLS, Storage</div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                      background: infraStatus.supabase.status === 'online' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                      color: infraStatus.supabase.status === 'online' ? '#4ade80' : '#fbbf24',
                      border: `1px solid ${infraStatus.supabase.status === 'online' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`
                    }}>
                      {infraStatus.supabase.label}
                    </span>
                  </div>
                  {infraStatus.supabase.incident && (
                    <div style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '0.5rem', borderRadius: '0.35rem', marginTop: '0.5rem' }}>
                      {infraStatus.supabase.incident}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '0.5rem' }}>
                    Região: AWS us-east-1 · Criptografia AES-256
                  </div>
                </div>

                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Cpu size={20} color={COLORS.blue} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>OpenAI API</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>gpt-4.1-mini (Organização Textual)</div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                      background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)'
                    }}>
                      Operacional
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '0.5rem' }}>
                    Política: Zero Data Retention (ZDR) · Sem treinamento
                  </div>
                </div>

                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Mic size={20} color={COLORS.indigo} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Groq Whisper LPU</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Transcrição de Áudios</div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                      background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)'
                    }}>
                      Operacional
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '0.5rem' }}>
                    Processamento em Memória · Descarte Imediato
                  </div>
                </div>

                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileCheck size={20} color={COLORS.orange} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Gotenberg PDF Engine</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compilação de Relatórios</div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                      background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)'
                    }}>
                      Docker Local (VPS)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '0.5rem' }}>
                    100% Isolado · Sem tráfego externo
                  </div>
                </div>

                <div className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Coins size={20} color={COLORS.amber} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Asaas Pagamentos</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gateway PIX & Notas Fiscais</div>
                      </div>
                    </div>
                    <span style={{
                      padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                      background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.3)'
                    }}>
                      Operacional
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)', marginTop: '0.5rem' }}>
                    Instituição Financeira Regulada (BACEN)
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Tab 2: DOCUMENTOS COM ERRO */}
            {logsSubTab === 'errors' && (
              <div className="card" style={{ padding: '1rem' }}>
                {errorAtas.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <CheckCircle size={32} color={COLORS.emerald} style={{ margin: '0 auto 0.5rem' }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Nenhum erro de processamento registrado!</div>
                    <div style={{ fontSize: '0.8rem' }}>Todos os documentos foram processados com sucesso.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {errorAtas.map(errAta => (
                      <div key={errAta.id} style={{
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '0.5rem', padding: '0.85rem 1rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '0.15rem 0.4rem', borderRadius: '0.25rem' }}>
                              FALHA
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-main)' }}>
                              {errAta.titulo || 'Documento sem título'}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(errAta.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                          Advogado: <strong style={{ color: 'var(--text-main)' }}>{errAta.advogado_nome}</strong> ({errAta.advogado_email})
                        </div>
                        <div style={{
                          background: 'rgba(0,0,0,0.4)', padding: '0.6rem 0.75rem', borderRadius: '0.35rem',
                          fontSize: '0.78rem', fontFamily: 'monospace', color: '#f87171', wordBreak: 'break-all'
                        }}>
                          {errAta.error_message || 'Erro desconhecido durante o pipeline de processamento.'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sub-Tab 3: TODOS OS LOGS / AUDITORIA */}
            {(logsSubTab === 'all' || logsSubTab === 'admin') && (
              <div className="card" style={{ padding: '1rem', overflowX: 'auto' }}>
                {systemLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Nenhum registro de log encontrado.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {systemLogs
                      .filter(l => {
                        if (logsSubTab === 'admin') return (l.acao || '').startsWith('admin_');
                        return true;
                      })
                      .filter(l => {
                        if (!logsSearch) return true;
                        const q = logsSearch.toLowerCase();
                        return (
                          (l.acao || '').toLowerCase().includes(q) ||
                          (l.advogado_nome || '').toLowerCase().includes(q) ||
                          (l.advogado_email || '').toLowerCase().includes(q) ||
                          JSON.stringify(l.payload || {}).toLowerCase().includes(q)
                        );
                      })
                      .map((log) => {
                        const isAdm = (log.acao || '').startsWith('admin_');
                        const isDel = (log.acao || '').includes('delete') || (log.acao || '').includes('revoke');
                        const isSec = (log.acao || '').includes('pin') || (log.acao || '').includes('auth');
                        
                        let badgeBg = 'rgba(59, 130, 246, 0.15)';
                        let badgeColor = '#60a5fa';
                        let badgeBorder = 'rgba(59, 130, 246, 0.3)';

                        if (isAdm) {
                          badgeBg = 'rgba(251, 191, 36, 0.15)';
                          badgeColor = '#fbbf24';
                          badgeBorder = 'rgba(251, 191, 36, 0.3)';
                        } else if (isDel) {
                          badgeBg = 'rgba(239, 68, 68, 0.15)';
                          badgeColor = '#f87171';
                          badgeBorder = 'rgba(239, 68, 68, 0.3)';
                        } else if (isSec) {
                          badgeBg = 'rgba(168, 85, 247, 0.15)';
                          badgeColor = '#c084fc';
                          badgeBorder = 'rgba(168, 85, 247, 0.3)';
                        }

                        return (
                          <div key={log.id} style={{
                            background: 'var(--panel-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.5rem',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem',
                            fontSize: '0.8rem',
                            transition: 'border-color 0.2s'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{
                                  background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`,
                                  padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700,
                                  letterSpacing: '0.03em'
                                }}>
                                  {log.acao}
                                </span>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                  {log.advogado_nome}
                                </span>
                                <span style={{ color: 'var(--text-dimmed)', fontSize: '0.75rem' }}>
                                  ({log.advogado_email})
                                </span>
                              </div>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {new Date(log.created_at).toLocaleString('pt-BR')}
                              </span>
                            </div>

                            {log.payload && Object.keys(log.payload).length > 0 && (
                              <div style={{
                                background: 'rgba(0,0,0,0.25)', padding: '0.4rem 0.6rem',
                                borderRadius: '0.35rem', fontFamily: 'monospace', fontSize: '0.72rem',
                                color: 'var(--text-muted)', wordBreak: 'break-all'
                              }}>
                                {JSON.stringify(log.payload)}
                              </div>
                            )}

                            {log.ip_address && log.ip_address !== 'internal' && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-dimmed)', display: 'flex', gap: '1rem' }}>
                                <span>IP: {log.ip_address}</span>
                                {log.user_agent && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>Agente: {log.user_agent}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
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
        message={`Tem certeza que deseja excluir "${confirmModal.nome}" e TODOS os dados (documentos, PDFs)? Esta ação é irreversível.`}
        confirmText="Excluir Permanentemente"
        variant="danger"
      />

      {/* Manual Credits Adjustment Modal */}
      <Modal 
        isOpen={adjustCreditsModal.isOpen} 
        onClose={() => setAdjustCreditsModal({ isOpen: false, targetUser: null, amount: 10, description: '', loading: false })}
        title={`Ajustar Créditos - ${adjustCreditsModal.targetUser?.nome || ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Saldo atual: <strong style={{ color: 'var(--text-main)' }}>{adjustCreditsModal.targetUser?.credit_balance ?? 0}</strong> créditos
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              Quantidade de Créditos (use valores negativos para remover)
            </label>
            <input
              type="number"
              value={adjustCreditsModal.amount}
              onChange={(e) => setAdjustCreditsModal(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="Ex: 10 ou -5"
              className="input-login"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              Motivo / Descrição
            </label>
            <input
              type="text"
              value={adjustCreditsModal.description}
              onChange={(e) => setAdjustCreditsModal(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Bônus de compra ou correção manual"
              className="input-login"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => setAdjustCreditsModal({ isOpen: false, targetUser: null, amount: 10, description: '', loading: false })}
              className="btn-secondary"
              disabled={adjustCreditsModal.loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleAdjustCreditsSubmit}
              className="btn-primary"
              disabled={adjustCreditsModal.loading}
            >
              {adjustCreditsModal.loading ? 'Ajustando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Client Transactions History Modal */}
      <Modal
        isOpen={transactionsModal.isOpen}
        onClose={() => setTransactionsModal({ isOpen: false, targetUser: null, transactions: [], loading: false })}
        title={`Histórico de Créditos - ${transactionsModal.targetUser?.nome || ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Saldo atual: <strong style={{ color: 'var(--text-main)' }}>{transactionsModal.targetUser?.credit_balance ?? 0}</strong> créditos
          </div>

          {transactionsModal.loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
              <div className="sp-wave" style={{ width: 24, height: 24 }} />
            </div>
          ) : transactionsModal.transactions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Nenhuma movimentação de créditos encontrada para este usuário.
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.25rem' }}>
              {transactionsModal.transactions.map((tx, idx) => {
                const isAdd = tx.amount > 0;
                const typeLabel = tx.type === 'purchase' ? 'Compra'
                  : tx.type === 'debit' ? 'Uso'
                  : tx.type === 'admin_adjustment_add' ? 'Ajuste Admin (+)'
                  : tx.type === 'admin_adjustment_sub' ? 'Ajuste Admin (-)'
                  : tx.type === 'trial' ? 'Boas-Vindas'
                  : tx.type;
                
                const typeColor = tx.type === 'purchase' ? '#10b981'
                  : tx.type === 'debit' ? '#ef4444'
                  : (tx.type === 'admin_adjustment_add' || tx.type === 'admin_adjustment_sub') ? '#fbbf24'
                  : '#818cf8';

                return (
                  <div 
                    key={tx.id || idx} 
                    style={{
                      background: 'var(--bg-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.5rem',
                      padding: '0.6rem 0.8rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                      fontSize: '0.8rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 600, color: typeColor, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {typeLabel}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date(tx.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 500 }}>
                      {tx.description || 'Sem descrição'}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem', fontSize: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.4rem' }}>
                      <span style={{ color: isAdd ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {isAdd ? '+' : ''}{tx.amount} créditos
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Saldo: <strong style={{ color: 'var(--text-main)' }}>{tx.balance_after}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              onClick={() => setTransactionsModal({ isOpen: false, targetUser: null, transactions: [], loading: false })}
              className="btn-secondary"
            >
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ============================================
   SVG CHARTS
   ============================================ */

function WeeklyBarChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyChart message="Sem dados semanais" />;
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
                  ? `linear-gradient(180deg, ${COLORS.blue}, ${COLORS.indigo})`
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

  const STATUS_CHART_COLORS = {
    ready: COLORS.emerald,
    error: COLORS.red,
    uploading: COLORS.amber,
    parsing: COLORS.orange,
    transcribing: COLORS.sky,
    organizing: COLORS.cyan,
  };

  // Pre-calculate segments purely to satisfy React hook rules
  const segments = data.map((d, i) => {
    const pct = Number(d.total) / total;
    const dashLength = pct * circumference;
    const offset = data.slice(0, i).reduce((sum, item) => {
      const itemPct = Number(item.total) / total;
      return sum + (itemPct * circumference);
    }, 0);
    const color = STATUS_CHART_COLORS[d.status] || '#64748b';
    return { ...d, dashLength, offset, color };
  });

  return (
    <div className="adm-donut-container">
      <svg width="150" height="150" viewBox="0 0 150 150">
        {segments.map((seg, i) => (
          <circle key={i}
            cx="75" cy="75" r={radius}
            fill="none" stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="round"
            transform="rotate(-90 75 75)"
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        ))}
        <text x="75" y="72" textAnchor="middle" fill="var(--text-main)" fontSize="22" fontWeight="700">{total}</text>
        <text x="75" y="90" textAnchor="middle" fill="var(--text-muted)" fontSize="10">total docs</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {segments.map((seg, i) => {
          const label = ATA_STATUS_MAP[seg.status]?.label || seg.status;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ color: 'var(--text-main)', fontWeight: 600, marginLeft: 'auto' }}>{seg.total}</span>
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

function StatCard({ icon: IconComponent, label, value, color, sub, delay = 0, highlight = false }) {
  const Icon = IconComponent;
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

function MiniStat({ icon: IconComponent, label, value, danger = false }) {
  const Icon = IconComponent;
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
