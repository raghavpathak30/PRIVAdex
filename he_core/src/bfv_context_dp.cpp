#include "bfv_context_dp.h"

#include <stdexcept>
#include <vector>

BFVContextDP::BFVContextDP()
    : params(seal::scheme_type::bfv),
    context(nullptr) {
    // V2 BFV exact path: n=16384, coeff_modulus {60,30,30,30,60}, t via Batching(20 bits).
    params.set_poly_modulus_degree(16384);
    params.set_coeff_modulus(seal::CoeffModulus::Create(16384, {60, 30, 30, 30, 60}));
    // Use a batching-compatible Fermat prime so t-1 is a power of two.
    // This keeps equality exponentiation memory and depth practical.
    params.set_plain_modulus(65537);

    context = std::make_shared<seal::SEALContext>(params);
    if (!context->parameters_set()) {
        throw std::runtime_error("BFVContextDP: SEAL rejected parameters");
    }

    seal::KeyGenerator keygen(*context);
    secret_key = keygen.secret_key();
    keygen.create_public_key(public_key);
    keygen.create_relin_keys(relin_keys);
    keygen.create_galois_keys(std::vector<int>{1, 2, 4, 8, 16, 32, 64, 128, 256}, galois_keys);

    batch_encoder.emplace(*context);
    encryptor.emplace(*context, public_key);
    decryptor.emplace(*context, secret_key);
    evaluator.emplace(*context);

    // Round-trip probe to validate batching and integer flow.
    std::vector<std::uint64_t> probe(batch_encoder->slot_count(), 0ULL);
    probe[0] = 42ULL;
    probe[1] = 7ULL;

    seal::Plaintext pt;
    batch_encoder->encode(probe, pt);

    seal::Ciphertext ct;
    encryptor->encrypt(pt, ct);

    seal::Plaintext out_pt;
    decryptor->decrypt(ct, out_pt);

    std::vector<std::uint64_t> out;
    batch_encoder->decode(out_pt, out);
    if (out.size() < 2 || out[0] != 42ULL || out[1] != 7ULL) {
        throw std::runtime_error("BFVContextDP: round-trip integer probe failed");
    }
}
