#pragma once

#include <cmath>
#include <memory>
#include <optional>

#include <seal/seal.h>

inline constexpr char DARKPOOL_SPEC_VERSION[] = "2.0";

struct CKKSContextDP {
    seal::EncryptionParameters params;
    std::shared_ptr<seal::SEALContext> context;

    seal::SecretKey secret_key;
    seal::PublicKey public_key;
    seal::RelinKeys relin_keys;
    seal::GaloisKeys galois_keys;
    std::optional<seal::CKKSEncoder> encoder;
    std::optional<seal::Encryptor> encryptor;
    std::optional<seal::Decryptor> decryptor;
    std::optional<seal::Evaluator> evaluator;

    double scale = std::pow(2.0, 40);

    // parms_id chain (degree-27 path: 4 middle 40-bit primes -> 4 levels)
    seal::parms_id_type second_parms_id;
    seal::parms_id_type third_parms_id;
    seal::parms_id_type fourth_parms_id;
    seal::parms_id_type fifth_parms_id;

    explicit CKKSContextDP(bool use_degree27 = true);
    CKKSContextDP(const CKKSContextDP&) = delete;
    CKKSContextDP& operator=(const CKKSContextDP&) = delete;
};
