#pragma once

#include <seal/seal.h>

seal::Ciphertext bfv_equality_eval(
    const seal::Ciphertext& enc_bid,
    const seal::Ciphertext& enc_ask,
    seal::Evaluator& ev,
    const seal::RelinKeys& rlk,
    seal::Encryptor& encryptor,
    seal::BatchEncoder& batch_encoder,
    std::uint64_t plain_modulus);
