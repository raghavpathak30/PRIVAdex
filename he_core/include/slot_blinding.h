#pragma once

#include <seal/seal.h>

int generate_blind_offset();

seal::Ciphertext apply_slot_blind(
    const seal::Ciphertext& ct,
    int blind_offset,
    const seal::GaloisKeys& gk,
    seal::Evaluator& ev);

seal::Ciphertext remove_slot_blind(
    const seal::Ciphertext& ct_blinded_result,
    int blind_offset,
    const seal::GaloisKeys& gk,
    seal::Evaluator& ev);
