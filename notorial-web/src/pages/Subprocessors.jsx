import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Shield, Server, Database, Cpu, Mic,
  Coins, FileCheck, Lock, ExternalLink, Mail
} from 'lucide-react';
import LegalFooter from '../components/LegalFooter';
import Logo from '../components/Logo';

export default function Subprocessors() {
  const navigate = useNavigate();

  const subprocessors = [
    {
      name: 'Supabase, Inc. / AWS',
      role: 'Hospedagem de Banco de Dados, Autenticação e Armazenamento Temporário',
      location: 'Estados Unidos (AWS us-east-1)',
      security: 'Criptografia em repouso AES-256, TLS 1.3 em trânsito, Row Level Security (RLS) estrito e certificação SOC 2 Tipo II / ISO 27001.',
      zdr: 'Dados cadastrais e registros de auditoria mantidos conforme política de retenção da LGPD. Hashes periciais imutáveis.',
      icon: Database,
      badgeColor: '#3b82f6'
    },
    {
      name: 'OpenAI OpCo, LLC',
      role: 'Processamento Semântico e Estruturação Cronológica de Textos',
      location: 'Estados Unidos',
      security: 'Contrato de API Comercial com criptografia TLS 1.3 e isolamento corporativo.',
      zdr: 'Política Contratual de Zero Data Retention (ZDR): os dados transmitidos para formatação e estruturação não são armazenados após a conclusão do endpoint e NÃO são utilizados para treinamento de modelos públicos de inteligência artificial.',
      icon: Cpu,
      badgeColor: '#10b981'
    },
    {
      name: 'Groq, Inc.',
      role: 'Transcrição Fonética de Mensagens de Áudio (Whisper v3 LPU)',
      location: 'Estados Unidos',
      security: 'Processamento acelerado por hardware LPU (Language Processing Unit).',
      zdr: 'Processamento Efêmero em Memória: as mídias de áudio são convertidas em texto em memória RAM e imediatamente descartadas. Não há persistência de áudios em discos da operadora.',
      icon: Mic,
      badgeColor: '#6366f1'
    },
    {
      name: 'Gotenberg (Container Local na VPS)',
      role: 'Compilação de Relatórios Técnicos em Formato PDF',
      location: 'Servidor VPS Próprio (Local)',
      security: 'Ambiente Docker isolado na rede interna do sistema.',
      zdr: 'Isolamento Absoluto: a renderização visual e compilação do relatório ocorrem inteiramente dentro do servidor local da LegisVox, sem envio de dados para nenhuma API ou servidor externo.',
      icon: FileCheck,
      badgeColor: '#f59e0b'
    },
    {
      name: 'Asaas Gestão Financeira S.A.',
      role: 'Gateway de Pagamento (PIX e Cartão) e Emissão de Notas Fiscais',
      location: 'Brasil (Joinville/SC)',
      security: 'Instituição de Pagamento regulada e autorizada pelo Banco Central do Brasil (BACEN) e conformidade PCI-DSS.',
      zdr: 'Processamento estrito de dados fiscais e de faturamento necessários para cumprimento de obrigação legal e regulatória (Art. 7º, II da LGPD).',
      icon: Coins,
      badgeColor: '#ec4899'
    }
  ];

  return (
    <div className="page-enter" style={{ minHeight: '100vh', background: 'var(--bg-color)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Bar */}
      <header style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--panel-bg)',
        padding: '0.85rem 1.5rem',
        position: 'sticky', top: 0, zIndex: 40,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            <Logo size={32} />
            <span className="font-serif" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
              LegisVox
            </span>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.25rem', flex: 1, width: '100%' }}>
        
        {/* Header Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: 'var(--primary-glow)', color: 'var(--gold-main)',
            padding: '0.35rem 0.9rem', borderRadius: '9999px',
            fontSize: '0.75rem', fontWeight: 700, marginBottom: '1rem',
            border: '1px solid rgba(212, 160, 23, 0.3)'
          }}>
            <Shield size={14} /> TRANSPARÊNCIA E CONFORMIDADE LGPD (ART. 39)
          </div>
          <h1 className="font-serif" style={{ fontSize: '2.2rem', color: 'var(--text-main)', margin: '0 0 0.75rem', lineHeight: 1.2 }}>
            Suboperadores de Dados Autorizados
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
            Para fornecer a infraestrutura do <strong>LegisVox</strong> com máxima segurança, disponibilidade e rigor técnico, 
            a <strong>Legatus Tecnologia e Portais de Conteúdo Ltda.</strong> conta com parceiros e suboperadores homologados 
            sob rigorosos acordos de processamento de dados (DPA) e diretrizes de retenção zero (ZDR).
          </p>
        </div>

        {/* Subprocessors List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2.5rem' }}>
          {subprocessors.map((sub, idx) => {
            const Icon = sub.icon;
            return (
              <div key={idx} className="card" style={{ padding: '1.75rem', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '0.5rem',
                      background: `${sub.badgeColor}15`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon size={22} style={{ color: sub.badgeColor }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                        {sub.name}
                      </h2>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dimmed)' }}>
                        📍 {sub.location}
                      </span>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700,
                    background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80',
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                    padding: '0.2rem 0.6rem', borderRadius: '9999px'
                  }}>
                    Homologado & Auditado
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '0.75rem' }}>
                  Finalidade: {sub.role}
                </div>

                <div style={{
                  background: 'var(--bg-color)', padding: '1rem',
                  borderRadius: '0.5rem', border: '1px solid var(--border-color)',
                  fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6
                }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong style={{ color: 'var(--text-main)' }}>Salvaguardas Técnicas: </strong>
                    {sub.security}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--gold-main)' }}>Garantia de Retenção Zero (ZDR): </strong>
                    {sub.zdr}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* DPO / Contact Box */}
        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(212, 160, 23, 0.06), var(--panel-bg))', border: '1px solid rgba(212, 160, 23, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Mail size={20} color="var(--gold-main)" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Canal de Atendimento ao Titular e DPO (Encarregado)
            </h3>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
            Para esclarecer dúvidas sobre os suboperadores, exercer seus direitos previstos no Art. 18 da LGPD ou obter cópia integral de relatórios de impacto, entre em contato diretamente com o nosso Encarregado de Proteção de Dados:
          </p>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-color)' }}>
            E-mail: privacidade@legisvox.com.br · Atendimento em até 3 dias úteis
          </div>
        </div>

      </main>

      <LegalFooter />
    </div>
  );
}
