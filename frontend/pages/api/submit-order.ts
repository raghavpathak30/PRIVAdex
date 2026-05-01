import type { NextApiRequest, NextApiResponse } from 'next';

interface SubmitOrderRequest {
  bid: number;
  ask: number;
  qty: number;
}

interface SubmitOrderResponse {
  success: boolean;
  match: boolean;
  quantityMatched: number;
  timings: {
    deserialization: number;
    slotBlind: number;
    signPoly: number;
    accumulate: number;
    serialization: number;
    total: number;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubmitOrderResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      match: false,
      quantityMatched: 0,
      timings: {
        deserialization: 0,
        slotBlind: 0,
        signPoly: 0,
        accumulate: 0,
        serialization: 0,
        total: 0,
      },
      error: 'Method not allowed',
    });
  }

  const { bid, ask, qty } = req.body as SubmitOrderRequest;

  // Validate inputs
  if (typeof bid !== 'number' || typeof ask !== 'number' || typeof qty !== 'number') {
    return res.status(400).json({
      success: false,
      match: false,
      quantityMatched: 0,
      timings: {
        deserialization: 0,
        slotBlind: 0,
        signPoly: 0,
        accumulate: 0,
        serialization: 0,
        total: 0,
      },
      error: 'Invalid request: bid, ask, qty must be numbers',
    });
  }

  // Validate ranges [1, 2^20]
  if (bid < 1 || bid > 1048576 || ask < 1 || ask > 1048576 || qty < 1 || qty > 1048576) {
    return res.status(400).json({
      success: false,
      match: false,
      quantityMatched: 0,
      timings: {
        deserialization: 0,
        slotBlind: 0,
        signPoly: 0,
        accumulate: 0,
        serialization: 0,
        total: 0,
      },
      error: 'Values must be between 1 and 2^20 (1048576)',
    });
  }

  try {
    // Demo matching logic: match if bid/ask spread is <= 50
    const spread = Math.abs(bid - ask);
    const isMatch = spread <= 50;

    // Simulated timings (in milliseconds)
    const timings = {
      deserialization: 2.5 + Math.random() * 2,
      slotBlind: 1.2 + Math.random() * 1.5,
      signPoly: 8.1 + Math.random() * 3,
      accumulate: 0.8 + Math.random() * 0.5,
      serialization: 1.5 + Math.random() * 1,
      total: 0,
    };

    timings.total = timings.deserialization +
      timings.slotBlind +
      timings.signPoly +
      timings.accumulate +
      timings.serialization;

    return res.status(200).json({
      success: true,
      match: isMatch,
      quantityMatched: isMatch ? qty : 0,
      timings,
    });
  } catch (error: any) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      match: false,
      quantityMatched: 0,
      timings: {
        deserialization: 0,
        slotBlind: 0,
        signPoly: 0,
        accumulate: 0,
        serialization: 0,
        total: 0,
      },
      error: error.message || 'Internal server error',
    });
  }
}
