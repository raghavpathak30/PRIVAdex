#include <grpcpp/grpcpp.h>

#include <atomic>
#include <cstdint>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

#include "matching_server.h"
#include "seal_serialization.h"

int main() {
    auto service = std::make_shared<MatchingServiceImpl>();

    auto& bfv = service->bfv_context();

    auto make_ct = [&](std::uint64_t value) {
        std::vector<std::uint64_t> slots(bfv.batch_encoder->slot_count(), value);
        seal::Plaintext pt;
        bfv.batch_encoder->encode(slots, pt);
        seal::Ciphertext ct;
        bfv.encryptor->encrypt(pt, ct);
        return darkpool::serialization::CiphertextToString(ct);
    };

    std::vector<darkpool::MatchRequest> requests(8);
    for (int i = 0; i < 8; ++i) {
        auto& req = requests[static_cast<std::size_t>(i)];
        req.set_request_id("concurrent-" + std::to_string(i));
        req.set_pool_id("default");
        req.set_order_nonce(static_cast<std::uint64_t>(i + 1));
        req.set_use_bfv(true);
        req.set_trader_id("trader-" + std::to_string(i));

        std::string nonce(16, '\0');
        for (int k = 0; k < 16; ++k) {
            nonce[k] = static_cast<char>(i * 17 + k + 1);
        }
        req.set_nonce(nonce);

        req.set_buy_order(make_ct(100ULL + static_cast<std::uint64_t>(i)));
        req.set_sell_order(make_ct(100ULL + static_cast<std::uint64_t>(i)));
    }

    std::atomic<int> failures{0};
    std::vector<std::thread> workers;
    workers.reserve(8);

    for (int i = 0; i < 8; ++i) {
        workers.emplace_back([&, i]() {
            darkpool::MatchResponse resp;
            grpc::ServerContext ctx;
            auto st = service->SubmitOrder(&ctx, &requests[static_cast<std::size_t>(i)], &resp);
            if (!st.ok() || resp.is_error() || resp.result_ciphertext().empty()) {
                ++failures;
            }
        });
    }

    for (auto& t : workers) {
        t.join();
    }

    if (failures.load() != 0) {
        std::cerr << "concurrent submit failures=" << failures.load() << "\n";
        return 1;
    }

    std::cout << "concurrent_submit_test PASS\n";
    return 0;
}
