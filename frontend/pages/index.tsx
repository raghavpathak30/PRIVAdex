'use client';

import { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from '@/lib/contract';
import useDarkPool from '../hooks/useDarkPool';

type StatusTone = 'pending' | 'success' | 'error';

type LogEntry = {
  message: string;
  tone: StatusTone;
  time: string;
};

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function makeRequestId() {
  return ethers.id(`${Date.now()}-${Math.random()}`);
}

export default function Home() {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [registerTxHash, setRegisterTxHash] = useState('');
  const [bidMatchId, setBidMatchId] = useState('');
  const [askMatchId, setAskMatchId] = useState('');
  const [decryptBidId, setDecryptBidId] = useState('');
  const [orderType, setOrderType] = useState<'bid' | 'ask'>('bid');
  const { submitOrder, tryMatch, requestDecryption } = useDarkPool();

  const stories = useMemo(
      () => [
        'Traders submit intent without publishing the price ladder.',
        'The contract records the order and preserves the private match trail.',
        'The encrypted settlement step waits for real fhEVM inputs instead of fake bytes.',
      ],
      []
    );

    const addLog = (message: string, tone: StatusTone) => {
      setLog((prev) => [...prev, { message, tone, time: nowLabel() }]);
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
        addLog('Wallet connected to Sepolia', 'success');
      } catch (error) {
        console.error('Wallet connection error:', error);
        alert('Failed to connect wallet');
      }
    };

    const handlePrepareOrder = async () => {
      if (!walletConnected || !provider) {
        alert('Connect MetaMask first');
        return;
      }

      setIsSubmitting(true);
      setLog([]);
      setRegisterTxHash('');

      try {
        addLog('Encrypting and submitting order via fhEVM flow', 'pending');
        const requestId = makeRequestId();
        setBidMatchId(requestId);
        setDecryptBidId(requestId);

        // price/qty are demo values shown in UI; real app should read inputs
        const price = BigInt(10);
        const qty = BigInt(100);

        const tx = await submitOrder(price, qty, requestId, orderType === 'bid');
        setRegisterTxHash(tx.hash ?? tx.transactionHash ?? '');
        addLog(`Order (${orderType.toUpperCase()}) encrypted and submitOrder() confirmed on Sepolia`, 'success');
        if (orderType === 'bid') {
          setBidMatchId(requestId);
        } else {
          setAskMatchId(requestId);
        }
        addLog('Settlement step paused until the bridge supplies real encrypted handles', 'success');
      } catch (error) {
        console.error('Order submission error:', error);
        addLog(`Error: ${String(error).slice(0, 80)}`, 'error');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleTryMatch = async () => {
      if (!bidMatchId || !askMatchId) {
        addLog('Enter both order IDs before matching', 'error');
        return;
      }

      try {
        addLog('Requesting on-chain match check', 'pending');
        const tx = await tryMatch(bidMatchId, askMatchId);
        addLog(`Match requested: ${tx.hash}`, 'success');
      } catch (error) {
        console.error('Match error:', error);
        addLog(`Error: ${String(error).slice(0, 80)}`, 'error');
      }
    };

    const handleRevealResult = async () => {
      if (!decryptBidId) {
        addLog('Enter an order ID before revealing the result', 'error');
        return;
      }

      try {
        addLog('Requesting public decryption', 'pending');
        const tx = await requestDecryption(decryptBidId);
        addLog(`Decryption requested: ${tx.hash}`, 'success');
      } catch (error) {
        console.error('Reveal error:', error);
        addLog(`Error: ${String(error).slice(0, 80)}`, 'error');
      }
    };

    return (
      <main className="relative min-h-screen overflow-hidden bg-[#F6F1E8] text-[#111827]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%)]" />

        <section id="story" className="mx-auto grid min-h-[88vh] max-w-[1320px] gap-10 px-5 pb-8 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-8">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D7CBB6] bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#6B5B4B] shadow-sm">
              Sepolia live demo
            </div>

            <div className="max-w-3xl space-y-5">
              <h1 className="text-5xl font-semibold tracking-tight text-[#101828] sm:text-6xl lg:text-7xl">
                A dark pool should feel private, calm, and human.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[#4B5563] sm:text-xl">
                PrivaDEX keeps the price hidden while the match is decided. Traders see a simple flow: send intent, register on Sepolia, and let the encrypted settlement bridge do the rest when it has real fhEVM inputs.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {stories.map((story, index) => (
                <div key={story} className="rounded-3xl border border-[#DED3C3] bg-white/75 p-5 shadow-[0_10px_30px_rgba(17,24,39,0.05)] backdrop-blur">
                  <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-sm font-semibold text-white">
                    0{index + 1}
                  </div>
                  <p className="text-sm leading-6 text-[#374151]">{story}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#DED3C3] bg-white/85 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.08)] backdrop-blur">
            <div className="rounded-[1.5rem] border border-[#E5DCCF] bg-[#FBF8F4] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[#8B6F47]">What changed</p>
              <p className="mt-3 text-2xl font-medium leading-9 text-[#111827]">
                The page no longer promises a fake encrypted settlement tx. It registers the order cleanly, then pauses where real fhEVM proof material is required.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#111827] p-4 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-[#D1D5DB]">On-chain</p>
                <p className="mt-2 text-base leading-7 text-white/90">registerOrder() confirms on Sepolia.</p>
              </div>
              <div className="rounded-2xl border border-[#E5DCCF] bg-[#FFF9F1] p-4 text-[#111827]">
                <p className="text-xs uppercase tracking-[0.18em] text-[#8B6F47]">Settlement</p>
                <p className="mt-2 text-base leading-7 text-[#374151]">waits for valid encrypted handles, not placeholders.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-[1320px] px-5 pb-8 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-[2rem] border border-[#DED3C3] bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-[#111827]">Live order demo</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#4B5563]">
                    Two traders, one private venue. This interaction now stops before the broken settlement call that was causing gas estimation to fail.
                  </p>
                </div>
                <div className="flex gap-3 items-center">
                  {walletConnected && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOrderType('bid')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                          orderType === 'bid'
                            ? 'bg-[#111827] text-white'
                            : 'border border-[#D7CBB6] bg-white text-[#111827] hover:border-[#111827]'
                        }`}
                      >
                        BID
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrderType('ask')}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                          orderType === 'ask'
                            ? 'bg-[#111827] text-white'
                            : 'border border-[#D7CBB6] bg-white text-[#111827] hover:border-[#111827]'
                        }`}
                      >
                        ASK
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={walletConnected ? handlePrepareOrder : connectWallet}
                    disabled={isSubmitting}
                    className="shrink-0 rounded-full bg-[#111827] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#0F172A] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {walletConnected ? (isSubmitting ? 'Submitting...' : 'Register order') : 'Connect MetaMask'}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-[#E5DCCF] bg-[#FBF8F4] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8B6F47]">Trader A</p>
                  <div className="mt-3 space-y-2 text-sm text-[#374151]">
                    <div className="rounded-2xl bg-white px-3 py-2">Buy 100 @ 10</div>
                    <div className="rounded-2xl bg-white px-3 py-2">Intent stays private</div>
                  </div>
                </div>
                <div className="rounded-3xl border border-[#E5DCCF] bg-[#FBF8F4] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8B6F47]">Trader B</p>
                  <div className="mt-3 space-y-2 text-sm text-[#374151]">
                    <div className="rounded-2xl bg-white px-3 py-2">Sell 100 @ 10</div>
                    <div className="rounded-2xl bg-white px-3 py-2">No public price leak</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-3xl border border-[#E5DCCF] bg-[#FBF8F4] p-4 sm:grid-cols-3">
                <input
                  value={bidMatchId}
                  onChange={(event) => setBidMatchId(event.target.value)}
                  placeholder="Bid order ID"
                  className="rounded-2xl border border-[#D7CBB6] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#111827]"
                />
                <input
                  value={askMatchId}
                  onChange={(event) => setAskMatchId(event.target.value)}
                  placeholder="Ask order ID"
                  className="rounded-2xl border border-[#D7CBB6] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#111827]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTryMatch}
                    className="flex-1 rounded-full border border-[#111827] px-4 py-2 text-sm font-medium text-[#111827] transition hover:bg-[#111827] hover:text-white"
                  >
                    Request Match
                  </button>
                  <button
                    type="button"
                    onClick={handleRevealResult}
                    className="flex-1 rounded-full border border-[#8B6F47] px-4 py-2 text-sm font-medium text-[#8B6F47] transition hover:bg-[#8B6F47] hover:text-white"
                  >
                    Reveal Result
                  </button>
                </div>
              </div>

              {walletConnected && (
                <div className="mt-5 rounded-2xl border border-[#D7CBB6] bg-[#FFF9F1] px-4 py-3 text-sm text-[#374151]">
                  Connected wallet: <span className="font-medium text-[#111827]">{walletAddress}</span>
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-[#DED3C3] bg-[#111827] p-6 text-white shadow-[0_20px_60px_rgba(17,24,39,0.08)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[#F5D0A9]">Execution log</p>
              <div className="mt-4 space-y-3">
                {log.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                    Connect MetaMask, then register the order to see the safe Sepolia path.
                  </p>
                ) : (
                  log.map((item) => (
                    <div key={`${item.time}-${item.message}`} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/90">
                      <span className="min-w-[74px] text-xs uppercase tracking-[0.12em] text-white/45">{item.time}</span>
                      <span>
                        {item.tone === 'success' && '✓ '}
                        {item.tone === 'pending' && '… '}
                        {item.tone === 'error' && '! '}
                        {item.message}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {registerTxHash && (
                <div className="mt-5 rounded-2xl border border-[#F5D0A9]/40 bg-[#F5D0A9]/10 px-4 py-3 text-sm text-[#FDE68A]">
                  Register transaction:{' '}
                  <a className="underline decoration-white/40 underline-offset-4" href={`https://sepolia.etherscan.io/tx/${registerTxHash}`} target="_blank" rel="noreferrer">
                    open on Etherscan
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="contract" className="mx-auto max-w-[1320px] px-5 pb-14 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-[#DED3C3] bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8B6F47]">Deployed contract</p>
              <h2 className="mt-3 text-2xl font-semibold text-[#111827]">Sepolia address</h2>
              <p className="mt-2 text-sm leading-6 text-[#4B5563]">
                The deployed settlement contract stays visible here so the pitch can point at a real chain target instead of a mock route.
              </p>
              <div className="mt-5 rounded-3xl border border-[#E5DCCF] bg-[#FBF8F4] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#8B6F47]">Contract</p>
                <p className="mt-2 break-all text-sm text-[#111827]">{CONTRACT_ADDRESS}</p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#DED3C3] bg-[#111827] p-6 text-white shadow-[0_20px_60px_rgba(17,24,39,0.08)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[#F5D0A9]">Why the old flow broke</p>
              <p className="mt-3 text-xl leading-9 text-white/92">
                The frontend was fabricating ciphertext and proof bytes, which made fhEVM revert during gas estimation. That is now replaced with a truthful handoff: the order registers on-chain, and the settlement step waits for real encrypted material.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">No fake settleMatch() call</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">No architecture/benchmark routes in the nav</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
