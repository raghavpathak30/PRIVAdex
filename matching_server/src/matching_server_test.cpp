#include <grpcpp/grpcpp.h>

#include <chrono>
#include <iostream>
#include <memory>
#include <vector>

#include "matching_server.h"
#include "seal_serialization.h"

int main() {
    const std::string address = "127.0.0.1:50073";
    auto service = std::make_shared<MatchingServiceImpl>();
    auto server = BuildMatchingServer(address, service);
    if (!server) {
        std::cerr << "failed to start test server\n";
        return 1;
    }

    auto channel = grpc::CreateChannel(address, grpc::InsecureChannelCredentials());
    if (!channel->WaitForConnected(std::chrono::system_clock::now() + std::chrono::seconds(2))) {
        std::cerr << "channel connection timeout\n";
        server->Shutdown();
        return 1;
    }
    auto stub = darkpool::MatchingService::NewStub(channel);

    // Health-check gate.
    {
        darkpool::PingRequest ping;
        darkpool::PongResponse pong;
        ping.set_message("health");
        grpc::ClientContext ctx;
        auto st = stub->Ping(&ctx, ping, &pong);
        if (!st.ok() || pong.message().empty()) {
            std::cerr << "Ping RPC failed\n";
            server->Shutdown();
            return 1;
        }
    }

    auto &bfv = service->bfv_context();

    auto make_ct = [&](std::uint64_t value) {
        std::vector<std::uint64_t> slots(bfv.batch_encoder->slot_count(), value);
        seal::Plaintext pt;
        bfv.batch_encoder->encode(slots, pt);
        seal::Ciphertext ct;
        bfv.encryptor->encrypt(pt, ct);
        return ct;
    };

    auto run_case = [&](std::uint64_t buy, std::uint64_t sell, bool expect_zero) {
        auto buy_ct = make_ct(buy);
        auto sell_ct = make_ct(sell);

        darkpool::MatchRequest req;
        req.set_request_id("it");
        req.set_pool_id("default");
        req.set_order_nonce(1);
        req.set_use_bfv(true);
        req.set_buy_order(darkpool::serialization::CiphertextToString(buy_ct));
        req.set_sell_order(darkpool::serialization::CiphertextToString(sell_ct));

        darkpool::MatchResponse resp;
        grpc::ClientContext ctx;
        auto st = stub->ExecuteMatch(&ctx, req, &resp);
        if (!st.ok() || resp.is_error()) {
            std::cerr << "ExecuteMatch failed: " << st.error_message() << " | "
                      << resp.error_message() << "\n";
            return false;
        }

        auto out_ct = darkpool::serialization::StringToCiphertext(resp.result_ciphertext(), *bfv.context);
        seal::Plaintext out_pt;
        bfv.decryptor->decrypt(out_ct, out_pt);
        std::vector<std::uint64_t> decoded;
        bfv.batch_encoder->decode(out_pt, decoded);

        const bool is_zero = (decoded[0] == 0ULL);
        return expect_zero ? is_zero : !is_zero;
    };

    const bool equal_ok = run_case(100ULL, 100ULL, true);
    const bool unequal_ok = run_case(100ULL, 101ULL, false);

    server->Shutdown();

    if (!equal_ok || !unequal_ok) {
        std::cerr << "matching_server_test equality checks failed\n";
        return 1;
    }

    std::cout << "matching_server_test PASS\n";
    return 0;
}
