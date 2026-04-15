#pragma once

#include <memory>
#include <optional>

#include <seal/seal.h>

struct BFVContextDP {
    seal::EncryptionParameters params;
    std::shared_ptr<seal::SEALContext> context;

    seal::SecretKey secret_key;
    seal::PublicKey public_key;
    seal::RelinKeys relin_keys;
    seal::GaloisKeys galois_keys;
    std::optional<seal::BatchEncoder> batch_encoder;
    std::optional<seal::Encryptor> encryptor;
    std::optional<seal::Decryptor> decryptor;
    std::optional<seal::Evaluator> evaluator;

    explicit BFVContextDP();
    BFVContextDP(const BFVContextDP&) = delete;
    BFVContextDP& operator=(const BFVContextDP&) = delete;
};
