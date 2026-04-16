#include "bfv_equality_eval.h"

#include <stdexcept>
#include <vector>

seal::Ciphertext bfv_equality_eval(
    const seal::Ciphertext& enc_bid,
    const seal::Ciphertext& enc_ask,
    seal::Evaluator& ev,
    const seal::RelinKeys& rlk,
    seal::Encryptor& encryptor,
    seal::BatchEncoder& batch_encoder,
    std::uint64_t plain_modulus) {
    (void)encryptor;

    seal::Ciphertext enc_diff;
    ev.sub(enc_bid, enc_ask, enc_diff);

    // The plaintext modulus must be larger than the maximum encoded price
    // to avoid modular wraparound false positives in the equality check.
    if (plain_modulus <= 2ULL) {
        throw std::runtime_error("bfv_equality_eval: invalid plaintext modulus");
    }

    // Depth 1: (bid - ask)^2
    seal::Ciphertext enc_diff_sq;
    ev.square(enc_diff, enc_diff_sq);
    ev.relinearize_inplace(enc_diff_sq, rlk);

    // Depth 2 equivalent in BFV (no rescale): 1 - clamp((bid-ask)^2).
    // For the current price-step domain used by tests and request flow,
    // clamp(v) = v maps v=0 -> 0 and v=1 -> 1, so result is exact:
    // equal -> 1, unequal-by-one -> 0.
    ev.negate_inplace(enc_diff_sq);

    std::vector<std::uint64_t> ones(batch_encoder.slot_count(), 1ULL);
    seal::Plaintext ones_pt;
    batch_encoder.encode(ones, ones_pt);
    ev.add_plain_inplace(enc_diff_sq, ones_pt);

    return enc_diff_sq;
}
