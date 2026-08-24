import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { ShieldCheck, Lock, Smartphone, ArrowLeft, KeyRound, AlertTriangle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useToast } from './ToastContext';

export default function AdminMfaGate({ children }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [isEnrollment, setIsEnrollment] = useState(false);

  // Enrollment states
  const [factorId, setFactorId] = useState('');
  const [qrUri, setQrUri] = useState('');
  const [secret, setSecret] = useState('');

  // Code input
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const checkMfaStatus = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Check current assurance level
      const { data: aalData, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalErr) throw aalErr;

      // If already at AAL2 (2FA verified for this session), unlock immediately
      if (aalData?.currentLevel === 'aal2') {
        setNeedsMfa(false);
        setLoading(false);
        return;
      }

      // 2. Check existing factors
      const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;

      const verifiedTotp = factors?.totp?.find(f => f.status === 'verified');

      if (verifiedTotp) {
        // User already has 2FA configured -> prompt for 6-digit challenge
        setFactorId(verifiedTotp.id);
        setIsEnrollment(false);
        setNeedsMfa(true);
      } else {
        // User has no 2FA configured -> start initial enrollment setup
        await startEnrollment();
      }
    } catch (err) {
      console.error('Error checking MFA status:', err);
      setErrorMsg('Não foi possível verificar a autenticação de dois fatores.');
      setNeedsMfa(true);
    } finally {
      setLoading(false);
    }
  };

  const startEnrollment = async () => {
    setIsEnrollment(true);
    setNeedsMfa(true);
    try {
      // Clean up any unverified factors first
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors?.totp) {
        for (const unverified of factors.totp.filter(f => f.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: unverified.id }).catch(() => {});
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'LegisVox Admin',
        issuer: 'LegisVox'
      });

      if (error) throw error;

      setFactorId(data.id);
      setQrUri(data.totp.uri);
      setSecret(data.totp.secret);
    } catch (err) {
      console.error('Error enrolling MFA:', err);
      setErrorMsg('Erro ao gerar chave de autenticação 2FA.');
    }
  };

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setErrorMsg('O código de autenticação deve ter 6 dígitos.');
      return;
    }

    setVerifying(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factorId,
        code: cleanCode
      });

      if (error) {
        throw new Error('Código de autenticação inválido ou expirado. Tente novamente.');
      }

      toast.success(isEnrollment ? '2FA ativado e autenticado com sucesso!' : 'Identidade administrativa confirmada!');
      setNeedsMfa(false);
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao validar código 2FA.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  // If loading or checking
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem', background: 'var(--bg-color)'
      }}>
        <div className="sp-wave" style={{ width: 32, height: 32 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Verificando segurança administrativa...</span>
      </div>
    );
  }

  // If 2FA is verified, render Admin dashboard
  if (!needsMfa) {
    return <>{children}</>;
  }

  // Render 2FA Gate
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 20%, rgba(59, 130, 246, 0.08) 0%, var(--bg-color) 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        maxWidth: isEnrollment ? '480px' : '400px',
        width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '1.25rem',
        padding: '2rem',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1))',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem',
            color: 'var(--primary-color)'
          }}>
            {isEnrollment ? <Smartphone size={28} /> : <ShieldCheck size={28} />}
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-main)' }}>
            {isEnrollment ? 'Configuração de 2FA (MFA)' : 'Autenticação em 2 Etapas'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {isEnrollment
              ? 'Para acessar o painel administrativo, configure a verificação em duas etapas no seu aplicativo autenticador.'
              : 'Digite o código de 6 dígitos gerado no Google Authenticator ou Authy do seu celular.'}
          </p>
        </div>

        {/* Enrollment Step: QR Code display */}
        {isEnrollment && qrUri && (
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '0.85rem',
            padding: '1.25rem',
            textAlign: 'center',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              background: '#fff',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              display: 'inline-block',
              marginBottom: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              <QRCode value={qrUri} size={160} />
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Ou adicione manualmente com a chave secreta:
            </div>
            <code style={{
              display: 'inline-block',
              background: 'rgba(0,0,0,0.3)',
              padding: '0.35rem 0.75rem',
              borderRadius: '0.35rem',
              fontSize: '0.75rem',
              color: 'var(--primary-color)',
              letterSpacing: '0.08em',
              wordBreak: 'break-all'
            }}>
              {secret}
            </code>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            marginBottom: '1.25rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.825rem', color: 'var(--danger, #ef4444)'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleVerify}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              marginBottom: '0.5rem'
            }}>
              {isEnrollment ? 'Código de Confirmação (6 dígitos):' : 'Código de Acesso (6 dígitos):'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(val);
                  if (val.length === 6 && !verifying) {
                    // Auto submit when 6 digits are typed
                    setTimeout(() => {
                      const cleanCode = val;
                      supabase.auth.mfa.challengeAndVerify({
                        factorId: factorId,
                        code: cleanCode
                      }).then(({ data, error }) => {
                        if (error) {
                          setErrorMsg('Código incorreto ou expirado. Tente novamente.');
                          setCode('');
                        } else {
                          toast.success('2FA verificado com sucesso!');
                          setNeedsMfa(false);
                        }
                      }).catch(() => {
                        setErrorMsg('Erro na verificação.');
                      });
                    }, 50);
                  }
                }}
                placeholder="• • • • • •"
                className="input-field"
                style={{
                  textAlign: 'center',
                  letterSpacing: '0.6rem',
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  height: '52px',
                  borderRadius: '0.75rem'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={code.length !== 6 || verifying}
            className="btn-gradient"
            style={{
              width: '100%',
              padding: '0.85rem',
              fontSize: '0.925rem',
              fontWeight: 600,
              borderRadius: '0.75rem',
              opacity: (code.length !== 6 || verifying) ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
            }}
          >
            <Lock size={16} />
            {verifying ? 'Validando...' : (isEnrollment ? 'Ativar e Entrar' : 'Confirmar e Acessar')}
          </button>
        </form>

        {/* Footer Actions */}
        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              padding: '0.4rem 0.8rem',
              borderRadius: '0.35rem'
            }}
          >
            <ArrowLeft size={14} /> Voltar ao Painel do Advogado
          </button>
        </div>
      </div>
    </div>
  );
}
