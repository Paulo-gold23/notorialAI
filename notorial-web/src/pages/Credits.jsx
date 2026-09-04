import React, { useState, useEffect, useMemo } from 'react';
import { creditsApi } from '../services/creditsApi';
import QRCode from 'react-qr-code';
import { Shield, Sparkles, CheckCircle2, Coins, Clock, ArrowRight, Sliders, Zap, TrendingDown, Star, AlertCircle } from 'lucide-react';
import BackButton from '../components/BackButton';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/ToastContext';
import LegalFooter from '../components/LegalFooter';

/* ─── Helpers ─── */
const formatBRL = (cents) => {
  const val = (cents / 100).toFixed(2).replace('.', ',');
  return `R$\u00A0${val}`;
};

const CUSTOM_MIN = 50;
const CUSTOM_MAX = 2000;
const CUSTOM_STEP = 5;

export default function Credits() {
  const [balance, setBalance] = useState(0);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [copied, setCopied] = useState(false);
  const [customCredits, setCustomCredits] = useState(100);
  const [showCpfPrompt, setShowCpfPrompt] = useState(false);
  const [cpfForCheckout, setCpfForCheckout] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [purchaseConfirm, setPurchaseConfirm] = useState(null); // { credits, totalCents, pricePerPage, cpf }
  const toast = useToast();

  useEffect(() => {
    loadData();
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [bal, pkgs] = await Promise.all([
        creditsApi.getBalance(),
        creditsApi.getPackages()
      ]);
      setBalance(bal);
      setPackages(pkgs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /* Split packages */
  const fixedPackages = useMemo(() => packages.filter(p => p.slug !== 'sob-medida'), [packages]);
  const customPkg = useMemo(() => packages.find(p => p.slug === 'sob-medida'), [packages]);

  /* Custom pricing calc */
  const customPricePerPage = customPkg?.price_per_page_cents || 55;
  const customTotalCents = customCredits * customPricePerPage;

  const isValidCpf = (cpf) => {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
      let d = 0;
      for (let c = 0; c < t; c++) d += parseInt(cpf[c]) * ((t + 1) - c);
      d = ((10 * d) % 11) % 10;
      if (parseInt(cpf[t]) !== d) return false;
    }
    return true;
  };

  const isValidCnpj = (cnpj) => {
    cnpj = cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    let tamanho = 12, numeros = cnpj.substring(0, tamanho);
    const digitos = cnpj.substring(tamanho);
    let soma = 0, pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) { soma += numeros.charAt(tamanho - i) * pos--; if (pos < 2) pos = 9; }
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) return false;
    tamanho = 13; numeros = cnpj.substring(0, tamanho); soma = 0; pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) { soma += numeros.charAt(tamanho - i) * pos--; if (pos < 2) pos = 9; }
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    return resultado == digitos.charAt(1);
  };

  const handlePurchase = async (pkg, overrideCredits = null, cpf = '') => {
    try {
      setLoading(true);
      const cleanCpf = cpf.replace(/\D/g, '');
      const res = await creditsApi.purchasePackage(pkg.id, 'PIX', overrideCredits, cleanCpf);
      if (res.status === 'success' && res.payment) {
        if (cleanCpf) {
          sessionStorage.setItem('user_cpf_raw', cleanCpf);
        }
        setPaymentData({
          ...res.payment,
          pkg_name: overrideCredits ? `Sob Medida (${overrideCredits} pág.)` : pkg.name,
        });
        const interval = setInterval(async () => {
          const newBalance = await creditsApi.getBalance();
          if (newBalance > balance) {
            clearInterval(interval);
            setPaymentData(null);
            setBalance(newBalance);
            toast.success('Pagamento confirmado! Créditos adicionados.');
          }
        }, 5000);
        setPollingInterval(interval);
      }
    } catch (e) {
      const msg = e.message || 'Erro desconhecido. Tente novamente.';
      if (msg.includes('offline') || msg.includes('inacess')) {
        toast.error(`⚡ ${msg}`, { duration: 8000 });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseClick = (pkg, overrideCredits = null) => {
    const credits = overrideCredits || pkg.credits;
    const pricePerPage = pkg.price_per_page_cents || customPricePerPage;
    const totalCents = credits * pricePerPage;
    const cachedCpf = sessionStorage.getItem('user_cpf_raw') || '';

    // Show pre-purchase confirmation summary
    setPurchaseConfirm({
      pkg,
      credits,
      totalCents,
      pricePerPage,
      cpf: cachedCpf,
      overrideCredits,
    });
  };

  const handleConfirmPurchase = () => {
    if (!purchaseConfirm) return;
    const { pkg, overrideCredits, cpf } = purchaseConfirm;
    setPurchaseConfirm(null);

    if (cpf && cpf.length >= 11) {
      handlePurchase(pkg, overrideCredits, cpf);
    } else {
      setCpfForCheckout('');
      setCpfError('');
      setShowCpfPrompt(true);
    }
  };


  const handleCopy = () => {
    if (!paymentData?.pix_payload) return;
    navigator.clipboard.writeText(paymentData.pix_payload);
    setCopied(true);
    toast.success('Código PIX copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  /* ─── Best value label helper ─── */
  const bestPricePerPage = useMemo(() => {
    if (!fixedPackages.length) return Infinity;
    return Math.min(...fixedPackages.map(p => p.price_per_page_cents));
  }, [fixedPackages]);

  return (
    <div className="page-enter container-centered pt-8 pb-16">
      <BackButton to="/dashboard" label="Voltar ao Painel" />

      {/* ─── Header + Balance ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-serif mb-2" style={{ color: 'var(--text-main)' }}>
            Planos &amp; Créditos
          </h1>
          <p style={{ color: 'var(--text-muted)' }} className="text-lg max-w-xl">
            Monte seu pacote personalizado de acordo com a sua demanda de páginas.
          </p>
        </div>

        <div className="card flex items-center gap-5 p-5 min-w-[240px]">
          <div className="flex items-center justify-center rounded-full p-3" style={{ background: 'var(--primary-glow)', color: 'var(--gold-main, var(--gold-to))' }}>
            <Coins size={28} />
          </div>
          <div>
            <span className="block text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
              Saldo Disponível
            </span>
            <div className="text-3xl font-serif mt-1 font-bold" style={{ color: 'var(--text-main)' }}>
              {loading ? '...' : Math.floor(balance)} <span className="text-sm font-sans font-normal" style={{ color: 'var(--text-dimmed)' }}>páginas</span>
            </div>
          </div>
        </div>
      </div>

      {paymentData ? (
        /* ─── CHECKOUT (PIX) ─── */
        <div className="max-w-2xl mx-auto mt-8">
          <div className="card text-center animate-scale-in" style={{ padding: '3rem 2rem' }}>
            <div className="mb-6 flex justify-center">
              <div className="rounded-full p-4" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <Shield size={32} />
              </div>
            </div>
            <h2 className="text-2xl font-serif mb-2" style={{ color: 'var(--text-main)' }}>Pagamento Seguro via PIX</h2>
            <p style={{ color: 'var(--text-muted)' }} className="mb-2">
              Pacote <strong>{paymentData.pkg_name}</strong>
            </p>
            <p className="text-3xl font-bold mb-8" style={{ color: 'var(--text-main)' }}>
              R$ {parseFloat(paymentData.price).toFixed(2).replace('.', ',')}
            </p>

            <div className="inline-flex items-center justify-center p-4 rounded-xl mb-6 bg-white shadow-sm border border-slate-200 min-h-[240px] min-w-[240px]">
              {paymentData.qr_code ? (
                <img
                  src={`data:image/png;base64,${paymentData.qr_code}`}
                  alt="QR Code Pix Asaas"
                  className="w-[220px] h-[220px] object-contain"
                />
              ) : paymentData.pix_payload ? (
                <QRCode value={paymentData.pix_payload} size={220} />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-slate-500">
                  <AlertCircle size={36} className="text-amber-500 mb-2" />
                  <span className="text-sm font-medium">QR Code em processamento...</span>
                </div>
              )}
            </div>

            <div className="max-w-md mx-auto space-y-4">
              <p className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                Ou copie o código PIX Copia e Cola:
              </p>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={paymentData.pix_payload || ''}
                  className="input-base"
                  style={{ paddingRight: '120px' }}
                />
                <button
                  onClick={handleCopy}
                  className="absolute right-1 top-1 bottom-1 btn-primary text-xs flex items-center gap-1"
                  style={{ padding: '0 1rem' }}
                >
                  {copied ? <CheckCircle2 size={14} /> : 'Copiar Pix'}
                </button>
              </div>

              {paymentData.invoice_url && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Precisa pagar pelo navegador?{' '}
                  <a
                    href={paymentData.invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium hover:opacity-80"
                    style={{ color: 'var(--gold-to)' }}
                  >
                    Abrir fatura Asaas
                  </a>
                </p>
              )}

              <div className="flex items-center justify-center gap-2 mt-8 py-3 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--gold-to)' }}>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                <span className="text-sm font-medium">Aguardando confirmação do pagamento...</span>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => {
                    setPaymentData(null);
                    if (pollingInterval) clearInterval(pollingInterval);
                  }}
                  className="btn-ghost"
                >
                  Cancelar e voltar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ─── PRICING UI ─── */
        <>
          {loading ? (
            <div className="max-w-4xl mx-auto mt-10 animate-pulse">
              <div className="card flex flex-col p-8 gap-4">
                <Skeleton height="2rem" width="40%" style={{ marginBottom: '0.75rem' }} />
                <Skeleton height="1rem" width="60%" style={{ marginBottom: '1.5rem' }} />
                <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />
                <div className="flex flex-col md:flex-row gap-8 mt-4">
                  <div className="flex-grow space-y-4">
                    <Skeleton height="3rem" width="50%" />
                    <Skeleton height="1.5rem" />
                    <Skeleton height="2.5rem" />
                  </div>
                  <div className="md:w-64 space-y-3">
                    <Skeleton height="3.5rem" />
                    <Skeleton height="1rem" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ─── Custom Credits Section ─── */}
              {customPkg && (
                <div className="max-w-4xl mx-auto mt-6 animate-scale-in">
                  <div
                    className="card overflow-hidden"
                    style={{
                      padding: 0,
                      border: '1px solid var(--border-color)',
                      background: 'var(--panel-bg)',
                    }}
                  >
                    {/* Header */}
                    <div
                      className="flex items-center gap-3 px-6 py-4"
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                    >
                      <div className="flex items-center justify-center rounded-lg p-2" style={{ background: 'var(--primary-glow)' }}>
                        <Sliders size={20} style={{ color: 'var(--primary-color)' }} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold font-serif" style={{ color: 'var(--text-main)' }}>
                          Adquirir Créditos Personalizados
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Escolha a quantidade exata de páginas que precisa processar
                        </p>
                      </div>
                      <div
                        className="ml-auto px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: 'var(--primary-glow)', color: 'var(--primary-color)' }}
                      >
                        {formatBRL(customPricePerPage)}/crédito
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-6 flex flex-col md:flex-row items-center gap-8">
                      {/* Slider area */}
                      <div className="flex-grow w-full md:w-auto">
                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                              Créditos
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                              <input
                                type="number"
                                min={50}
                                max={2000}
                                value={customCredits}
                                onChange={(e) => {
                                  let val = parseInt(e.target.value);
                                  if (isNaN(val)) val = 0;
                                  setCustomCredits(val);
                                }}
                                className="input-base"
                                style={{
                                  width: '7.5rem',
                                  fontSize: '2rem',
                                  fontFamily: 'var(--font-serif, serif)',
                                  fontWeight: 700,
                                  background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '0.5rem',
                                  padding: '0.25rem 0.5rem',
                                  color: 'var(--text-main)',
                                  textAlign: 'center',
                                }}
                              />
                              <span className="text-lg font-sans font-medium" style={{ color: 'var(--text-dimmed)' }}>
                                créditos
                              </span>
                            </div>
                            {customCredits > 0 && customCredits < 50 && (
                              <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                Compra mínima de 50 créditos.
                              </p>
                            )}
                            {customCredits > 2000 && (
                              <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                Máximo de 2.000 créditos por compra.
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                              Valor Total
                            </span>
                            <div className="text-3xl font-bold mt-1" style={{ color: 'var(--text-main)' }}>
                              {formatBRL(customTotalCents)}
                            </div>
                          </div>
                        </div>

                        {/* Range slider */}
                        <div className="relative mt-4">
                          <input
                            type="range"
                            min={CUSTOM_MIN}
                            max={CUSTOM_MAX}
                            step={CUSTOM_STEP}
                            value={customCredits > CUSTOM_MAX ? CUSTOM_MAX : customCredits < CUSTOM_MIN ? CUSTOM_MIN : customCredits}
                            onChange={(e) => setCustomCredits(Number(e.target.value))}
                            className="custom-range-slider"
                            style={{ width: '100%' }}
                          />
                          <div className="flex justify-between mt-2">
                            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{CUSTOM_MIN} pág.</span>
                            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{CUSTOM_MAX} pág.</span>
                          </div>
                        </div>

                        {/* Quick select buttons */}
                        <div className="flex flex-wrap gap-2 mt-6">
                          {[50, 100, 250, 500, 1000, 2000].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setCustomCredits(v)}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                              style={{
                                background: customCredits === v ? 'var(--primary-color)' : 'var(--surface-color)',
                                color: customCredits === v ? '#fff' : 'var(--text-muted)',
                                border: `1px solid ${customCredits === v ? 'var(--primary-color)' : 'var(--border-color)'}`,
                              }}
                            >
                              {v} pág.
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Purchase CTA */}
                      <div className="shrink-0 w-full md:w-auto flex flex-col items-center gap-3 md:min-w-[200px]">
                        <button
                          type="button"
                          onClick={() => handlePurchaseClick(customPkg, customCredits)}
                          disabled={loading || customCredits < 50 || customCredits > 2000}
                          className="btn-gradient w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Zap size={16} />
                          Comprar {customCredits >= 50 && customCredits <= 2000 ? `${customCredits} ` : ''}créditos
                        </button>
                        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                          <Shield size={11} />
                          Pagamento seguro via PIX
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Trust Section ─── */}
              <div className="mt-16 text-center pt-8 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  Pagamento processado com segurança por Asaas IP S.A.
                </p>
                <div className="flex items-center justify-center gap-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <Shield size={28} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>SSL/TLS</span>
                  </div>
                  <div className="h-8 w-px" style={{ background: 'var(--border-color)' }}></div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={28} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-dimmed)' }}>PIX Instantâneo</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
      <LegalFooter style={{ marginTop: '3rem' }} />

      {/* ─── Pre-Purchase Confirmation Modal ─── */}
      {purchaseConfirm && (
        <div
          className="modal-backdrop-responsive"
          onClick={(e) => { if (e.target === e.currentTarget) setPurchaseConfirm(null); }}
        >
          <div
            className="modal-card-responsive"
            style={{ maxWidth: '420px', padding: '2rem' }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '1rem' }}>
              📋 Resumo da Compra
            </h3>

            <div style={{
              background: 'var(--surface-color)', borderRadius: '0.75rem',
              padding: '1rem', marginBottom: '1rem', border: '1px solid var(--border-color)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Créditos (páginas)</span>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{purchaseConfirm.credits}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Valor por página</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{formatBRL(purchaseConfirm.pricePerPage)}</span>
              </div>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.5rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>Total</span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{formatBRL(purchaseConfirm.totalCents)}</span>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-dimmed)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              <p style={{ margin: '0 0 0.25rem' }}>⏳ <strong>Validade:</strong> 180 dias a partir da confirmação do pagamento.</p>
              <p style={{ margin: '0 0 0.25rem' }}>💳 <strong>Pagamento:</strong> PIX instantâneo via Asaas.</p>
              <p style={{ margin: 0 }}>📌 <strong>Reembolso:</strong> Créditos já utilizados não são passíveis de reembolso (cláusula 9.2).</p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn-gradient"
                style={{ flex: 1, padding: '0.75rem', fontSize: '0.9rem' }}
                onClick={handleConfirmPurchase}
                disabled={loading}
              >
                Confirmar Compra
              </button>
              <button
                style={{
                  padding: '0.75rem 1.25rem', fontSize: '0.85rem',
                  background: 'transparent', border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem', color: 'var(--text-muted)', cursor: 'pointer',
                }}
                onClick={() => setPurchaseConfirm(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCpfPrompt && (
        <div 
          className="modal-backdrop-responsive"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCpfPrompt(false);
          }}
        >
          <div 
            className="modal-dialog-responsive"
            style={{ maxWidth: '26rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-dialog-body" style={{ padding: '1.75rem 1.5rem' }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center rounded-full p-3 mb-3" style={{ background: 'var(--primary-glow)', color: 'var(--primary-color)' }}>
                  <Shield size={24} />
                </div>
                <h3 className="text-lg font-serif font-bold" style={{ color: 'var(--text-main)' }}>Confirmar Identidade</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Informe seu CPF ou CNPJ para emissão da nota fiscal e QR Code do PIX.
                </p>
              </div>

              {cpfError && (
                <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {cpfError}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                  CPF ou CNPJ
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  value={cpfForCheckout}
                  onChange={(e) => {
                    const val = e.target.value;
                    const digits = val.replace(/\D/g, '').slice(0, 14);
                    let formatted = digits;
                    if (digits.length <= 11) {
                      formatted = digits
                        .replace(/(\d{3})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                    } else {
                      formatted = digits
                        .replace(/(\d{2})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d)/, '$1/$2')
                        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
                    }
                    setCpfForCheckout(formatted);
                  }}
                  className="input-base w-full"
                  style={{ fontSize: '1rem', textAlign: 'center' }}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const clean = cpfForCheckout.replace(/\D/g, '');
                    if (clean.length === 11 && !isValidCpf(clean)) {
                      setCpfError('CPF inválido. Verifique os dígitos.');
                      return;
                    }
                    if (clean.length === 14 && !isValidCnpj(clean)) {
                      setCpfError('CNPJ inválido. Verifique os dígitos.');
                      return;
                    }
                    if (clean.length !== 11 && clean.length !== 14) {
                      setCpfError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
                      return;
                    }
                    setShowCpfPrompt(false);
                    handlePurchase(customPkg, customCredits, clean);
                  }}
                  className="btn-gradient w-full py-3 rounded-xl font-semibold text-sm cursor-pointer"
                >
                  Gerar PIX
                </button>
                <button
                  type="button"
                  onClick={() => setShowCpfPrompt(false)}
                  className="btn-ghost w-full py-2 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
