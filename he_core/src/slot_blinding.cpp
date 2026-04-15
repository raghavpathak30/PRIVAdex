#include "slot_blinding.h"

#include <random>
#include <stdexcept>

int generate_blind_offset() {
    std::random_device rd;
    std::uniform_int_distribution<int> dist(0, 15);
    return dist(rd);
}

seal::Ciphertext apply_slot_blind(
    const seal::Ciphertext& ct,
    int blind_offset,
    const seal::GaloisKeys& gk,
    seal::Evaluator& ev) {
    if (blind_offset < 0 || blind_offset > 15) {
        throw std::invalid_argument("apply_slot_blind: offset must be 0..15");
    }
    if (blind_offset == 0) {
        return ct;
    }

    seal::Ciphertext ct_blind = ct;
    for (int i = 0; i < blind_offset; ++i) {
        seal::Ciphertext rotated;
        ev.rotate_vector(ct_blind, 512, gk, rotated);
        ct_blind = std::move(rotated);
    }
    return ct_blind;
}

seal::Ciphertext remove_slot_blind(
    const seal::Ciphertext& ct_blinded_result,
    int blind_offset,
    const seal::GaloisKeys& gk,
    seal::Evaluator& ev) {
    if (blind_offset == 0) {
        return ct_blinded_result;
    }

    seal::Ciphertext ct_unblinded = ct_blinded_result;
    for (int i = 0; i < (16 - blind_offset); ++i) {
        seal::Ciphertext rotated;
        ev.rotate_vector(ct_unblinded, 512, gk, rotated);
        ct_unblinded = std::move(rotated);
    }
    return ct_unblinded;
}
