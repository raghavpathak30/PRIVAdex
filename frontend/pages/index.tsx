'use client';

import { useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from '@/lib/contract';
import useDarkPool from '../hooks/useDarkPool';

type StatusTone = 'pending' | 'success' | 'error';

type LogEntry = {
  message: string;
  tone: StatusTone;
  time: string;
};

type OrderRecord = {
  id: string;
  type: 'bid' | 'ask';
  pair: string;
  timestamp: string;
  status: 'registered' | 'matched';
};

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function makeRequestId() {
  return ethers.hexlify(ethers.randomBytes(32));
}

export default function Home() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [bidMatchId, setBidMatchId] = useState('');
  const [askMatchId, setAskMatchId] = useState('');
  const [orderType, setOrderType] = useState<'bid' | 'ask'>('bid');
  const [lastOrderId, setLastOrderId] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([]);
  const [ethAmount, setEthAmount] = useState('1.5');
  const [usdcAmount, setUsdcAmount] = useState('3000');
  const { submitOrder, tryMatch } = useDarkPool();

  const addLog = (message: string, tone: StatusTone) => {
    setLog((prev) => [...prev, { message, tone, time: nowLabel() }]);
  };

  const truncateAddress = (addr: string) => {
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  };

  const connectWallet = async () => {
    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        alert('MetaMask is not installed');
        return;
      }

      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await browserProvider.send('eth_requestAccounts', []);
      const network = await browserProvider.getNetwork();

      if (network.chainId !== BigInt(SEPOLIA_CHAIN_ID)) {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
        });
      }

      setProvider(browserProvider);
      setWalletAddress(accounts[0]);
      setWalletConnected(true);
      setLog([]);
      setOrderHistory([]);
      setLastAction('Connected to Sepolia');
      addLog('wallet connected to Sepolia', 'success');
    } catch (error) {
      console.error('Wallet connection error:', error);
      alert('Failed to connect wallet');
    }
  };

  const handleRegisterOrder = async () => {
    if (!walletConnected || !provider) {
      alert('Connect MetaMask first');
      return;
    }

    setIsSubmitting(true);

    try {
      addLog(`encrypting ${orderType.toUpperCase()} order via fhEVM`, 'pending');
      const requestId = makeRequestId();
      const price = BigInt(10);
      const qty = BigInt(100);

      const tx = await submitOrder(price, qty, requestId, orderType === 'bid');
      setLastOrderId(requestId);
      setLastAction(`Order ${requestId.slice(0, 10)}... registered as ${orderType.toUpperCase()}`);

      const newOrder: OrderRecord = {
        id: requestId,
        type: orderType,
        pair: `ETH/USDC @ ${price}`,
        timestamp: nowLabel(),
        status: 'registered',
      };
      setOrderHistory((prev) => [newOrder, ...prev]);

      if (orderType === 'bid') {
        setBidMatchId(requestId);
      } else {
        setAskMatchId(requestId);
      }

      addLog(`order registered on Sepolia as ${orderType.toUpperCase()}`, 'success');
      addLog(`order ID ${requestId.slice(0, 16)}...`, 'success');
    } catch (error) {
      console.error('Order submission error:', error);
      addLog(String(error).slice(0, 80), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryMatch = async () => {
    if (!bidMatchId || !askMatchId) {
      addLog('enter both BID and ASK order IDs before matching', 'error');
      return;
    }

    if (bidMatchId === askMatchId) {
      addLog('BID and ASK orders must be different', 'error');
      return;
    }

    setIsMatching(true);

    try {
      addLog('executing encrypted match', 'pending');
      const tx = await tryMatch(bidMatchId, askMatchId);
      setLastAction('Match confirmed on Sepolia');

      setOrderHistory((prev) =>
        prev.map((order) =>
          order.id === bidMatchId || order.id === askMatchId
            ? { ...order, status: 'matched' as const }
            : order
        )
      );

      addLog('match executed on encrypted circuit', 'success');
      addLog('match transaction confirmed', 'success');
    } catch (error) {
      console.error('Match error:', error);
      addLog(String(error).slice(0, 80), 'error');
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-[#e8e6e0]">
      <div className="mx-auto max-w-[1260px] px-5 pb-14 pt-6 md:px-8">
        <nav className="mb-10 flex items-center justify-between gap-6 rounded-xl border border-white/10 bg-[#0d0d12] px-5 py-4">
          <div className="[font-family:'Syne',sans-serif] text-lg font-bold tracking-tight text-white">
            Priva<span className="text-[#4af0a0]">DEX</span>
          </div>
          <div className="hidden items-center gap-8 [font-family:'IBM_Plex_Mono',monospace] text-xs uppercase tracking-[0.08em] text-white/55 md:flex">
            <a href="#problem" className="transition hover:text-white">Problem</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#demo" className="transition hover:text-white">Demo</a>
            <a href="#contract" className="transition hover:text-white">Contract</a>
          </div>
          {!walletConnected ? (
            <button
              type="button"
              onClick={connectWallet}
              className="rounded-md bg-[#4af0a0] px-4 py-2 text-xs font-semibold text-[#0a0a0f] [font-family:'Syne',sans-serif] transition hover:brightness-95"
            >
              Connect Wallet →
            </button>
          ) : (
            <div className="rounded-md border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-3 py-2 text-xs text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">
              {truncateAddress(walletAddress)}
            </div>
          )}
        </nav>

        <section id="problem" className="grid gap-10 pb-12 pt-4 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-6 inline-flex rounded border border-[#4af0a0]/35 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">
              Sepolia live · fhEVM
            </div>
            <h1 className="[font-family:'Syne',sans-serif] text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
              Every order you place
              <br />
              is <span className="text-[#4af0a0]">visible</span> before
              <br />
              it executes.
            </h1>
            <p className="mt-6 max-w-xl [font-family:'Syne',sans-serif] text-base leading-7 text-white/55">
              On public DEXes, your order lives in the mempool in plaintext. MEV bots read it, front-run it, and capture spread. PrivaDEX uses fully homomorphic encryption so matching happens inside ciphertext.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#demo" className="rounded-md bg-[#4af0a0] px-5 py-3 text-sm font-bold text-[#0a0a0f] [font-family:'Syne',sans-serif]">
                Try the live demo
              </a>
              <a href="#how" className="text-sm text-white/60 transition hover:text-white [font-family:'IBM_Plex_Mono',monospace]">
                Read the flow →
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.1em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Mempool · before PrivaDEX</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 [font-family:'IBM_Plex_Mono',monospace]">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span className="flex-1">BID 10 ETH @ 2,841 USDC</span>
                <span className="rounded bg-red-500/30 px-2 py-0.5 text-[10px]">EXPOSED</span>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-red-500/35 bg-red-500/15 px-3 py-2 text-xs text-red-200 [font-family:'IBM_Plex_Mono',monospace]">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span className="flex-1">bot sandwich inserted</span>
                <span className="rounded bg-red-500/35 px-2 py-0.5 text-[10px]">FRONT-RUN</span>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200 [font-family:'IBM_Plex_Mono',monospace]">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                <span className="flex-1">execution at worse price</span>
                <span className="rounded bg-red-500/25 px-2 py-0.5 text-[10px]">SLIPPAGE</span>
              </div>
            </div>

            <p className="mb-3 mt-6 text-[11px] uppercase tracking-[0.1em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Mempool · with PrivaDEX</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-md border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-3 py-2 text-xs text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4af0a0]" />
                <span className="flex-1">0x8f3a...c4e2 [ENCRYPTED]</span>
                <span className="rounded bg-[#4af0a0]/20 px-2 py-0.5 text-[10px]">FHE SEALED</span>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-[#4af0a0]/25 bg-[#4af0a0]/8 px-3 py-2 text-xs text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4af0a0]" />
                <span className="flex-1">match settled on-chain</span>
                <span className="rounded bg-[#4af0a0]/20 px-2 py-0.5 text-[10px]">PRIVATE</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3">
          <div className="bg-[#0a0a0f] px-6 py-5">
            <p className="text-3xl font-bold text-white [font-family:'Syne',sans-serif]">$1.3B+</p>
            <p className="mt-1 text-xs text-white/45 [font-family:'IBM_Plex_Mono',monospace]">MEV extracted annually</p>
          </div>
          <div className="bg-[#0a0a0f] px-6 py-5">
            <p className="text-3xl font-bold text-white [font-family:'Syne',sans-serif]">0</p>
            <p className="mt-1 text-xs text-white/45 [font-family:'IBM_Plex_Mono',monospace]">cleartext exposed</p>
          </div>
          <div className="bg-[#0a0a0f] px-6 py-5">
            <p className="text-3xl font-bold text-white [font-family:'Syne',sans-serif]">~100%</p>
            <p className="mt-1 text-xs text-white/45 [font-family:'IBM_Plex_Mono',monospace]">front-run protection</p>
          </div>
        </section>

        <section id="how" className="pb-12">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">How it works</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white [font-family:'Syne',sans-serif]">Three steps. Zero leaks.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">01 / ENCRYPT</p>
              <h3 className="mt-3 text-lg font-semibold text-white [font-family:'Syne',sans-serif]">Price never leaves your browser in plaintext</h3>
              <p className="mt-2 text-sm leading-6 text-white/55 [font-family:'Syne',sans-serif]">The fhEVM SDK encrypts your order locally before signing and the contract receives only a ciphertext handle.</p>
              <span className="mt-4 inline-block rounded border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-2 py-1 text-[10px] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">euint64 handle</span>
            </article>
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">02 / MATCH</p>
              <h3 className="mt-3 text-lg font-semibold text-white [font-family:'Syne',sans-serif]">Matching logic runs inside ciphertext</h3>
              <p className="mt-2 text-sm leading-6 text-white/55 [font-family:'Syne',sans-serif]">PrivaDEX matcher evaluates the crossing condition homomorphically on-chain without decrypting submitted price handles.</p>
              <span className="mt-4 inline-block rounded border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-2 py-1 text-[10px] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">TFHE.le() on-chain</span>
            </article>
            <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">03 / SETTLE</p>
              <h3 className="mt-3 text-lg font-semibold text-white [font-family:'Syne',sans-serif]">Result decrypted only after match</h3>
              <p className="mt-2 text-sm leading-6 text-white/55 [font-family:'Syne',sans-serif]">Settlement triggers a relayer decryption request and reveals match output only to authorized parties after confirmation.</p>
              <span className="mt-4 inline-block rounded border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-2 py-1 text-[10px] text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">Zama relayer</span>
            </article>
          </div>
        </section>

        <section id="demo" className="pb-12">
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Live demo · Sepolia testnet</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white [font-family:'Syne',sans-serif]">Submit a real encrypted order</h2>
          {lastAction && (
            <div className="mt-4 rounded-md border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-3 py-2 text-xs text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace]">
              {lastAction}
            </div>
          )}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Submit order</p>
              <div className="mt-4 flex gap-2 rounded-md bg-white/5 p-1 text-xs [font-family:'IBM_Plex_Mono',monospace]">
                <button
                  type="button"
                  onClick={() => setOrderType('bid')}
                  disabled={!walletConnected}
                  className={`flex-1 rounded px-3 py-2 ${orderType === 'bid' ? 'bg-[#4af0a0] text-[#0a0a0f]' : 'text-white/55'} disabled:opacity-50`}
                >
                  BID
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('ask')}
                  disabled={!walletConnected}
                  className={`flex-1 rounded px-3 py-2 ${orderType === 'ask' ? 'bg-[#4af0a0] text-[#0a0a0f]' : 'text-white/55'} disabled:opacity-50`}
                >
                  ASK
                </button>
              </div>

              <div className="mt-4">
                <label className="text-[11px] uppercase tracking-[0.1em] text-white/40 [font-family:'IBM_Plex_Mono',monospace]">ETH amount</label>
                <input
                  type="number"
                  value={ethAmount}
                  onChange={(e) => setEthAmount(e.target.value)}
                  disabled={!walletConnected}
                  className="mt-2 w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace] disabled:opacity-50"
                  placeholder="1.5"
                />
              </div>

              <div className="mt-4">
                <label className="text-[11px] uppercase tracking-[0.1em] text-white/40 [font-family:'IBM_Plex_Mono',monospace]">Limit price (USDC)</label>
                <input
                  type="number"
                  value={usdcAmount}
                  onChange={(e) => setUsdcAmount(e.target.value)}
                  disabled={!walletConnected}
                  className="mt-2 w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace] disabled:opacity-50"
                  placeholder="3000"
                />
              </div>

              <button
                type="button"
                onClick={handleRegisterOrder}
                disabled={!walletConnected || isSubmitting}
                className="mt-5 w-full rounded-md bg-[#4af0a0] px-4 py-3 text-sm font-bold text-[#0a0a0f] [font-family:'Syne',sans-serif] transition hover:brightness-95 disabled:opacity-60"
              >
                {isSubmitting ? 'Encrypting & submitting...' : 'Encrypt & Submit Order →'}
              </button>

              <div className="mt-3 flex items-center gap-2 text-[11px] text-white/45 [font-family:'IBM_Plex_Mono',monospace]">
                <span>🔒</span>
                <span>price encrypted client-side before signing</span>
              </div>

              {lastOrderId && (
                <div className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-white/40 [font-family:'IBM_Plex_Mono',monospace]">Order ID</p>
                  <p className="mt-2 break-all text-xs text-white/80 [font-family:'IBM_Plex_Mono',monospace]">{lastOrderId}</p>
                </div>
              )}

              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-[11px] uppercase tracking-[0.1em] text-white/40 [font-family:'IBM_Plex_Mono',monospace]">Match controls</p>
                <div className="mt-3 grid gap-3">
                  <input
                    type="text"
                    value={bidMatchId}
                    onChange={(e) => setBidMatchId(e.target.value)}
                    disabled={!walletConnected}
                    className="w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace] disabled:opacity-50"
                    placeholder="BID order ID"
                  />
                  <input
                    type="text"
                    value={askMatchId}
                    onChange={(e) => setAskMatchId(e.target.value)}
                    disabled={!walletConnected}
                    className="w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace] disabled:opacity-50"
                    placeholder="ASK order ID"
                  />
                  <button
                    type="button"
                    onClick={handleTryMatch}
                    disabled={!walletConnected || !bidMatchId || !askMatchId || isMatching}
                    className="rounded-md border border-[#4af0a0]/30 bg-[#4af0a0]/10 px-3 py-2 text-xs text-[#4af0a0] [font-family:'IBM_Plex_Mono',monospace] disabled:opacity-40"
                  >
                    {isMatching ? 'matching...' : 'request match'}
                  </button>
                </div>
              </div>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Execution log</p>
              <div className="mt-4 space-y-2">
                {log.length === 0 ? (
                  <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55 [font-family:'IBM_Plex_Mono',monospace]">
                    Connect wallet, encrypt a BID/ASK order, then request match to see live execution events.
                  </div>
                ) : (
                  log.map((item) => (
                    <div
                      key={`${item.time}-${item.message}`}
                      className={`flex items-start gap-3 rounded-md px-3 py-2 text-xs [font-family:'IBM_Plex_Mono',monospace] ${
                        item.tone === 'success'
                          ? 'bg-[#4af0a0]/10 text-[#4af0a0]'
                          : item.tone === 'error'
                            ? 'bg-red-500/12 text-red-300'
                            : 'bg-white/5 text-white/65'
                      }`}
                    >
                      <span className="min-w-[72px] text-white/35">{item.time}</span>
                      <span>{item.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {orderHistory.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Order history</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[680px] text-xs [font-family:'IBM_Plex_Mono',monospace]">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="px-2 py-2">ID</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Pair</th>
                      <th className="px-2 py-2">Time</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map((order) => (
                      <tr key={order.id} className="border-b border-white/5 text-white/75">
                        <td className="px-2 py-2">{order.id.slice(0, 12)}...</td>
                        <td className="px-2 py-2">
                          <span className={`rounded px-2 py-0.5 ${order.type === 'bid' ? 'bg-[#4af0a0]/20 text-[#4af0a0]' : 'bg-red-500/20 text-red-300'}`}>
                            {order.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-2 py-2">{order.pair}</td>
                        <td className="px-2 py-2">{order.timestamp}</td>
                        <td className="px-2 py-2">{order.status === 'registered' ? 'registered' : 'matched'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section id="contract" className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[11px] uppercase tracking-[0.1em] text-white/35 [font-family:'IBM_Plex_Mono',monospace]">Sepolia contract</p>
          <h3 className="mt-2 text-2xl font-bold text-white [font-family:'Syne',sans-serif]">PrivaDEX Matcher</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-white/55 [font-family:'Syne',sans-serif]">
            Live contract used by this demo for encrypted order registration and matching verification.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/40 [font-family:'IBM_Plex_Mono',monospace]">Address</p>
              <a
                href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-xs text-[#4af0a0] underline [font-family:'IBM_Plex_Mono',monospace]"
              >
                {CONTRACT_ADDRESS}
              </a>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-white/40 [font-family:'IBM_Plex_Mono',monospace]">Network</p>
              <p className="mt-1 text-xs text-white/70 [font-family:'IBM_Plex_Mono',monospace]">Sepolia · 11155111</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
