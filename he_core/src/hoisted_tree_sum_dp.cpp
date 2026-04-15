#include "hoisted_tree_sum_dp.h"

#include <stdexcept>
#include <vector>

namespace {

constexpr int STEPS_DP[] = {1, 2, 4, 8, 16, 32, 64, 128, 256};

}  // namespace

seal::Ciphertext hoisted_tree_sum_dp(
    const seal::Ciphertext& ct,
    const seal::GaloisKeys& gk,
    seal::Evaluator& ev,
    int n_features) {
    if (n_features != 512) {
        throw std::invalid_argument("hoisted_tree_sum_dp: n_features must be 512");
    }

    std::vector<seal::Ciphertext> rotated(9);

    #pragma omp parallel for schedule(static)
    for (int i = 0; i < 9; ++i) {
        ev.rotate_vector(ct, STEPS_DP[i], gk, rotated[i]);
    }

    seal::Ciphertext acc = ct;
    for (int i = 0; i < 9; ++i) {
        ev.add_inplace(acc, rotated[i]);
    }

    return acc;
}
