#include "ckks_context_dp.h"

#include <stdexcept>
#include <vector>

CKKSContextDP::CKKSContextDP(bool use_degree27)
    : params(seal::scheme_type::ckks),
    context(nullptr) {
    // Degree-27 default path: n=16384, {60,40,40,40,40,60} for depth-4.
    // Degree-15 fast path:     n=16384, {60,40,40,40,60} for depth-3.
    params.set_poly_modulus_degree(16384);
    if (use_degree27) {
        params.set_coeff_modulus(
            seal::CoeffModulus::Create(16384, {60, 40, 40, 40, 40, 60}));
    } else {
        params.set_coeff_modulus(
            seal::CoeffModulus::Create(16384, {60, 40, 40, 40, 60}));
    }

    context = std::make_shared<seal::SEALContext>(params);
    if (!context->parameters_set()) {
        throw std::runtime_error("CKKSContextDP: SEAL rejected parameters");
    }

    seal::KeyGenerator keygen(*context);
    secret_key = keygen.secret_key();
    keygen.create_public_key(public_key);
    keygen.create_relin_keys(relin_keys);
    // Required by V2: {1,2,4,8,16,32,64,128,256,512}
    keygen.create_galois_keys(std::vector<int>{1, 2, 4, 8, 16, 32, 64, 128, 256, 512}, galois_keys);

    encoder.emplace(*context);
    encryptor.emplace(*context, public_key);
    decryptor.emplace(*context, secret_key);
    evaluator.emplace(*context);

    auto ctx1 = context->first_context_data();
    if (!ctx1) {
        throw std::runtime_error("CKKSContextDP: missing first_context_data");
    }
    auto ctx2 = ctx1->next_context_data();
    auto ctx3 = ctx2 ? ctx2->next_context_data() : nullptr;
    auto ctx4 = ctx3 ? ctx3->next_context_data() : nullptr;
    if (!ctx2 || !ctx3 || !ctx4) {
        throw std::runtime_error("CKKSContextDP: insufficient modulus chain for required depth");
    }

    second_parms_id = ctx2->parms_id();
    third_parms_id = ctx3->parms_id();
    fourth_parms_id = ctx4->parms_id();

    if (use_degree27) {
        auto ctx5 = ctx4->next_context_data();
        if (!ctx5) {
            throw std::runtime_error("CKKSContextDP: degree-27 requires depth-4 chain");
        }
        fifth_parms_id = ctx5->parms_id();
    } else {
        fifth_parms_id = seal::parms_id_zero;
    }

    // Sanity check for context wiring and scale alignment.
    std::vector<double> probe(8192, 0.5);
    seal::Plaintext pt;
    seal::Ciphertext ct;
    encoder->encode(probe, scale, pt);
    encryptor->encrypt(pt, ct);
    if (ct.parms_id() != context->first_parms_id()) {
        throw std::runtime_error("CKKSContextDP: ciphertext not at first parms_id");
    }
}
