#include "order_encoder.h"

#include <stdexcept>
#include <vector>

static_assert(__BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__,
              "order_encoder: big-endian platform unsupported.");

namespace {

constexpr int ORDERS_PER_BATCH = 16;
constexpr int STRIDE = 512;
constexpr int TOTAL_SLOTS_CKKS = 8192;
constexpr int TOTAL_SLOTS_BFV = 16384;
constexpr int ASK_OFFSET = 256;

}  // namespace

std::vector<double> encode_order_batch(
    const std::vector<double>& bids,
    const std::vector<double>& asks,
    const std::vector<double>& qtys,
    int n_orders) {
    if (n_orders < 1 || n_orders > ORDERS_PER_BATCH) {
        throw std::invalid_argument("encode_order_batch: n_orders must be 1-16");
    }
    if (bids.size() < static_cast<std::size_t>(n_orders) ||
        asks.size() < static_cast<std::size_t>(n_orders) ||
        qtys.size() < static_cast<std::size_t>(n_orders)) {
        throw std::invalid_argument("encode_order_batch: insufficient input vectors");
    }

    std::vector<double> tiled(TOTAL_SLOTS_CKKS, 0.0);
    for (int k = 0; k < n_orders; ++k) {
        tiled[k * STRIDE + 0] = bids[k];
        tiled[k * STRIDE + 1] = qtys[k];
        tiled[k * STRIDE + ASK_OFFSET] = asks[k];
    }
    return tiled;
}

std::vector<std::uint64_t> encode_order_batch_bfv(
    const std::vector<std::uint64_t>& bids,
    const std::vector<std::uint64_t>& asks,
    const std::vector<std::uint64_t>& qtys,
    int n_orders) {
    if (n_orders < 1 || n_orders > ORDERS_PER_BATCH) {
        throw std::invalid_argument("encode_order_batch_bfv: n_orders must be 1-16");
    }
    if (bids.size() < static_cast<std::size_t>(n_orders) ||
        asks.size() < static_cast<std::size_t>(n_orders) ||
        qtys.size() < static_cast<std::size_t>(n_orders)) {
        throw std::invalid_argument("encode_order_batch_bfv: insufficient input vectors");
    }

    std::vector<std::uint64_t> tiled(TOTAL_SLOTS_BFV, 0ULL);
    for (int k = 0; k < n_orders; ++k) {
        tiled[k * STRIDE + 0] = bids[k];
        tiled[k * STRIDE + 1] = qtys[k];
        tiled[k * STRIDE + ASK_OFFSET] = asks[k];
    }
    return tiled;
}
