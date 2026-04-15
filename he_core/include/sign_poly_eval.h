#pragma once

#include <seal/seal.h>

#include "ckks_context_dp.h"

seal::Ciphertext sign_poly_eval_d27(
    const seal::Ciphertext& ct_in,
    seal::Evaluator& ev,
    seal::CKKSEncoder& encoder,
    const seal::RelinKeys& rlk,
    const CKKSContextDP& ctx);

seal::Ciphertext sign_poly_eval_d15(
    const seal::Ciphertext& ct_in,
    seal::Evaluator& ev,
    seal::CKKSEncoder& encoder,
    const seal::RelinKeys& rlk,
    const CKKSContextDP& ctx);
