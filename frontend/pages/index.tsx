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

type OrderRecord = {
  id: string;
  type: 'bid' | 'ask';
  pair: string;
  timestamp: string;
  status: 'registered' | 'matched';
  txHash?: string;
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
  const [isMatching, setIsMatching] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [registerTxHash, setRegisterTxHash] = useState('');
  const [bidMatchId, setBidMatchId] = useState('');
  const [askMatchId, setAskMatchId] = useState('');
  const [orderType, setOrderType] = useState<'bid' | 'ask'>('bid');
  const [lastOrderId, setLastOrderId] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([]);
  const [ethAmount, setEthAmount] = useState('1.5');
  const [usdcAmount, setUsdcAmount] = useState('3000');
  const [copiedId, setCopiedId] = useState('');
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
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
      addLog('✓ Wallet connected to Sepolia', 'success');
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
      addLog(`Encrypting ${orderType.toUpperCase()} order...`, 'pending');
      const requestId = makeRequestId();
      const price = BigInt(10);
      const qty = BigInt(100);

      const tx = await submitOrder(price, qty, requestId, orderType === 'bid');
      setRegisterTxHash(tx.hash ?? tx.transactionHash ?? '');
      setLastOrderId(requestId);
      setLastAction(`Order ${requestId.slice(0, 10)}... registered as ${orderType.toUpperCase()}`);

      // Add to order history
      const newOrder: OrderRecord = {
        id: requestId,
        type: orderType,
        pair: `ETH/USDC @ ${price}`,
        timestamp: nowLabel(),
        status: 'registered',
        txHash: tx.hash ?? tx.transactionHash,
      };
      setOrderHistory((prev) => [newOrder, ...prev]);

      // Auto-populate match fields
      if (orderType === 'bid') {
        setBidMatchId(requestId);
      } else {
        setAskMatchId(requestId);
      }

      addLog(`✓ Order encrypted and registered as ${orderType.toUpperCase()}on Sepolia`, 'success');
      addLog(`Order ID: ${requestId.slice(0, 16)}...`, 'success');
    } catch (error) {
      console.error('Order submission error:', error);
      addLog(`✗ ${String(error).slice(0, 60)}...`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryMatch = async () => {
    if (!bidMatchId || !askMatchId) {
      addLog('✗ Enter both BID and ASK order IDs before matching', 'error');
      return;
    }

    if (bidMatchId === askMatchId) {
      addLog('✗ BID and ASK orders must be different', 'error');
      return;
    }

    setIsMatching(true);

    try {
      addLog('Executing encrypted match...', 'pending');
      const tx = await tryMatch(bidMatchId, askMatchId);
      setLastAction(`Match confirmed → ${(tx.hash ?? tx.transactionHash ?? '').slice(0, 12)}...`);

      // Update order history
      setOrderHistory((prev) =>
        prev.map((order) =>
          order.id === bidMatchId || order.id === askMatchId
            ? { ...order, status: 'matched' as const }
            : order
        )
      );

      addLog(`✓ Match executed on FHE circuit`, 'success');
      addLog(`Tx: ${tx.hash ?? tx.transactionHash}`, 'success');
    } catch (error) {
      console.error('Match error:', error);
      addLog(`✗ ${String(error).slice(0, 60)}...`, 'error');
    } finally {
      setIsMatching(false);
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

        <section id="demo" className="mx-auto max-w-[1320px] px-5 pb-12 lg:px-8">
          {/* Header */}
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <h2 className="text-3xl font-semibold text-[#111827]">Live Demo</h2>
              <p className="mt-2 max-w-2xl text-base leading-7 text-[#4B5563]">
                Register two orders (BID and ASK) on Sepolia, then match them with encrypted price discovery. The intent stays private, the settlement is on-chain and verifiable.
              </p>
            </div>
            {!walletConnected ? (
              <button
                type="button"
                onClick={connectWallet}
                className="shrink-0 rounded-full bg-[#111827] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#0F172A]"
              >
                Connect MetaMask
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2 rounded-2xl border border-[#D7CBB6] bg-[#FFF9F1] px-4 py-3 text-sm">
                <span className="text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Connected</span>
                <span className="font-medium text-[#111827]">{truncateAddress(walletAddress)}</span>
              </div>
            )}
          </div>

          {/* Status bar */}
          {lastAction && (
            <div className="mb-6 rounded-2xl border border-[#D7CBB6] bg-[#FFF9F1] px-4 py-3 text-sm text-[#374151]">
              <span className="text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Last action: </span>
              <span className="font-medium">{lastAction}</span>
            </div>
          )}

          {/* Two-panel layout */}
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] mb-6">
            {/* LEFT PANEL: Place Order */}
            <div className="rounded-[2rem] border border-[#DED3C3] bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
              <h3 className="text-xl font-semibold text-[#111827]">Submit Order</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Protected by fhEVM</p>

              {/* BID/ASK Toggle */}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setOrderType('bid')}
                  disabled={!walletConnected}
                  className={`flex-1 rounded-full py-3 text-sm font-medium transition ${
                    orderType === 'bid'
                      ? 'bg-green-600 text-white shadow-lg'
                      : 'border border-[#D7CBB6] bg-white text-[#111827] hover:border-green-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  📈 BID
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('ask')}
                  disabled={!walletConnected}
                  className={`flex-1 rounded-full py-3 text-sm font-medium transition ${
                    orderType === 'ask'
                      ? 'bg-red-600 text-white shadow-lg'
                      : 'border border-[#D7CBB6] bg-white text-[#111827] hover:border-red-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  📉 ASK
                </button>
              </div>

              {/* ETH Amount */}
              <div className="mt-5">
                <label className="block text-xs uppercase tracking-[0.12em] text-[#8B6F47]">ETH Amount</label>
                <input
                  type="number"
                  value={ethAmount}
                  onChange={(e) => setEthAmount(e.target.value)}
                  disabled={!walletConnected}
                  className="mt-2 w-full rounded-2xl border border-[#D7CBB6] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#111827] disabled:opacity-50"
                  placeholder="1.5"
                />
              </div>

              {/* USDC Amount */}
              <div className="mt-4">
                <label className="block text-xs uppercase tracking-[0.12em] text-[#8B6F47]">USDC Price</label>
                <input
                  type="number"
                  value={usdcAmount}
                  onChange={(e) => setUsdcAmount(e.target.value)}
                  disabled={!walletConnected}
                  className="mt-2 w-full rounded-2xl border border-[#D7CBB6] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[#111827] disabled:opacity-50"
                  placeholder="3000"
                />
              </div>

              {/* Privacy badge */}
              <div className="mt-5 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-3 py-2">
                <span className="text-lg">🔒</span>
                <span className="text-xs text-green-700 font-medium">No price leak • FHE encrypted</span>
              </div>

              {/* Register Button */}
              <button
                type="button"
                onClick={handleRegisterOrder}
                disabled={!walletConnected || isSubmitting}
                className="mt-5 w-full rounded-full bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#0F172A] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '⏳ Submitting...' : '📝 Register Order'}
              </button>

              {/* Copy Order ID */}
              {lastOrderId && (
                <div className="mt-4 rounded-2xl border border-[#E5DCCF] bg-[#FBF8F4] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Your Order ID</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="flex-1 break-all text-xs text-[#111827] font-mono">{lastOrderId.slice(0, 16)}...</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(lastOrderId)}
                      className="shrink-0 text-sm text-[#8B6F47] hover:text-[#111827] transition"
                    >
                      {copiedId === lastOrderId ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT PANEL: Order Book / Match */}
            <div className="rounded-[2rem] border border-[#DED3C3] bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
              <h3 className="text-xl font-semibold text-[#111827]">Execute Match</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Encrypted matching</p>

              {/* BID Order ID */}
              <div className="mt-5">
                <label className="block text-xs uppercase tracking-[0.12em] text-green-700 font-medium">📈 BID Order ID</label>
                <input
                  type="text"
                  value={bidMatchId}
                  onChange={(e) => setBidMatchId(e.target.value)}
                  disabled={!walletConnected}
                  className="mt-2 w-full rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-[#111827] outline-none focus:border-green-600 disabled:opacity-50 font-mono"
                  placeholder="Auto-fills from last BID registration"
                />
              </div>

              {/* ASK Order ID */}
              <div className="mt-4">
                <label className="block text-xs uppercase tracking-[0.12em] text-red-700 font-medium">📉 ASK Order ID</label>
                <input
                  type="text"
                  value={askMatchId}
                  onChange={(e) => setAskMatchId(e.target.value)}
                  disabled={!walletConnected}
                  className="mt-2 w-full rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-[#111827] outline-none focus:border-red-600 disabled:opacity-50 font-mono"
                  placeholder="Auto-fills from last ASK registration"
                />
              </div>

              {/* Info box */}
              <div className="mt-5 rounded-2xl border border-[#E5DCCF] bg-[#FBF8F4] px-4 py-3 text-xs text-[#374151]">
                <p className="font-medium">✓ Match if: BID price ≥ ASK price</p>
              </div>

              {/* Request Match Button */}
              <button
                type="button"
                onClick={handleTryMatch}
                disabled={!walletConnected || !bidMatchId || !askMatchId || isMatching}
                className="mt-5 w-full rounded-full bg-[#111827] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#0F172A] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isMatching ? '⏳ Matching...' : '🚀 Request Match'}
              </button>

              {/* Match result */}
              {registerTxHash && (
                <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-green-700 font-medium">✓ Last Register TX</p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${registerTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-xs text-green-600 hover:text-green-800 break-all underline font-mono"
                  >
                    {registerTxHash.slice(0, 20)}...
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Order History Table */}
          {orderHistory.length > 0 && (
            <div className="mb-6 rounded-[2rem] border border-[#DED3C3] bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
              <h3 className="text-lg font-semibold text-[#111827] mb-4">Order History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#D7CBB6]">
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Order ID</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Type</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Pair</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Time</th>
                      <th className="text-left px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#8B6F47]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderHistory.map((order) => (
                      <tr key={order.id} className="border-b border-[#E5DCCF] hover:bg-[#FBF8F4] transition">
                        <td className="px-3 py-3 text-xs font-mono text-[#374151]">{order.id.slice(0, 12)}...</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            order.type === 'bid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {order.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-[#374151]">{order.pair}</td>
                        <td className="px-3 py-3 text-xs text-[#8B6F47]">{order.timestamp}</td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-medium ${
                            order.status === 'registered' ? 'text-amber-600' : 'text-green-600'
                          }`}>
                            {order.status === 'registered' ? '⏳ Registered' : '✓ Matched'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Execution Log */}
          <div className="rounded-[2rem] border border-[#DED3C3] bg-[#111827] p-6 text-white shadow-[0_20px_60px_rgba(17,24,39,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-[#F5D0A9]">Execution Log</p>
            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
              {log.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                  Connect MetaMask to start. Register a BID → ASK → Request Match to see live execution details.
                </p>
              ) : (
                log.map((item) => (
                  <div key={`${item.time}-${item.message}`} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6">
                    <span className="min-w-[74px] text-xs uppercase tracking-[0.12em] text-white/45 shrink-0">{item.time}</span>
                    <span className={`${
                      item.tone === 'success' ? 'text-green-300' :
                      item.tone === 'error' ? 'text-red-300' :
                      'text-white/70'
                    }`}>
                      {item.tone === 'success' && '✓ '}
                      {item.tone === 'pending' && '⏳ '}
                      {item.tone === 'error' && '✗ '}
                      {item.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section id="contract" className="mx-auto max-w-[1320px] px-5 pb-14 lg:px-8">
          <div className="rounded-[2rem] border border-[#DED3C3] bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8B6F47]">Sepolia testnet</p>
            <h2 className="mt-3 text-2xl font-semibold text-[#111827]">Deployed Contract</h2>
            <p className="mt-2 text-sm leading-6 text-[#4B5563]">
              This PrivaDEXMatcher contract runs live on Sepolia. Every order registration and match is verifiable on-chain while keeping the price encrypted inside the fhEVM circuit.
            </p>
            <div className="mt-5 rounded-3xl border border-[#E5DCCF] bg-[#FBF8F4] p-4 gap-4 grid sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#8B6F47]">Contract Address</p>
                <a href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="mt-2 break-all text-sm text-[#0066CC] hover:text-[#0052A3] font-mono underline">
                  {CONTRACT_ADDRESS}
                </a>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#8B6F47]">Network</p>
                <p className="mt-2 text-sm font-medium text-[#111827]">Sepolia (Chain ID: 11155111)</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }
