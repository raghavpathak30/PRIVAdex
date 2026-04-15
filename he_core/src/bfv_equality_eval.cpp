#include "bfv_equality_eval.h"

#include <random>
#include <stdexcept>

seal::Ciphertext bfv_equality_eval(
    const seal::Ciphertext& enc_bid,
    const seal::Ciphertext& enc_ask,
    seal::Evaluator& ev,
    const seal::RelinKeys& rlk,
    seal::Encryptor& encryptor,
    seal::BatchEncoder& batch_encoder,
    std::uint64_t plain_modulus) {
    seal::Ciphertext enc_diff;
    ev.sub(enc_bid, enc_ask, enc_diff);

    if (plain_modulus < 2ULL) {
        throw std::runtime_error("bfv_equality_eval: invalid plaintext modulus");
    }

    std::random_device rd;
    std::mt19937_64 rng(rd());
    std::uniform_int_distribution<std::uint64_t> dist(1ULL, plain_modulus - 1ULL);
    const std::uint64_t r = dist(rng);

    std::vector<std::uint64_t> r_slots(batch_encoder.slot_count(), r);
    seal::Plaintext r_pt;
    batch_encoder.encode(r_slots, r_pt);

    seal::Ciphertext enc_r;
    encryptor.encrypt(r_pt, enc_r);

    seal::Ciphertext masked;
    ev.multiply(enc_diff, enc_r, masked);
    ev.relinearize_inplace(masked, rlk);

    // Output contract:
    //   decrypt(masked)[k] == 0  => equal
    //   decrypt(masked)[k] != 0  => not equal
    return masked;
}
