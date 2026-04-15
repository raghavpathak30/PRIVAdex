#pragma once

#include <cstdint>
#include <vector>

std::vector<double> encode_order_batch(
    const std::vector<double>& bids,
    const std::vector<double>& asks,
    const std::vector<double>& qtys,
    int n_orders);

std::vector<std::uint64_t> encode_order_batch_bfv(
    const std::vector<std::uint64_t>& bids,
    const std::vector<std::uint64_t>& asks,
    const std::vector<std::uint64_t>& qtys,
    int n_orders);
