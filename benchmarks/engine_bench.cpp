#include <grpcpp/grpcpp.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <numeric>
#include <string>
#include <vector>

#include "ckks_context_dp.h"
#include "matching_server.h"
#include "seal_serialization.h"

int main(int argc, char** argv) {
    using Clock = std::chrono::high_resolution_clock;
    const std::string address = "127.0.0.1:50063";
    int iterations = 100;
    std::string json_path;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--iterations" && (i + 1) < argc) {
            iterations = std::max(1, std::stoi(argv[++i]));
        } else if (arg == "--json" && (i + 1) < argc) {
            json_path = argv[++i];
        }
    }

    CKKSContextDP client_ctx(true);
    auto server = BuildMatchingServer(address);
    if (!server) {
        std::cerr << "[engine_bench] failed to start server on " << address << "\n";
        return 1;
    }

    auto channel = grpc::CreateChannel(address, grpc::InsecureChannelCredentials());
    if (!channel->WaitForConnected(std::chrono::system_clock::now() + std::chrono::seconds(2))) {
        std::cerr << "[engine_bench] channel connection timeout\n";
        server->Shutdown();
        return 1;
    }
    auto stub = darkpool::MatchingService::NewStub(channel);

    {
        darkpool::PingRequest ping;
        darkpool::PongResponse pong;
        ping.set_message("bench");
        grpc::ClientContext ping_ctx;
        auto ping_status = stub->Ping(&ping_ctx, ping, &pong);
        if (!ping_status.ok()) {
            std::cerr << "[engine_bench] ping failed: " << ping_status.error_message() << "\n";
            server->Shutdown();
            return 1;
        }
    }

    std::vector<double> bid_slots(8192, 0.6);
    std::vector<double> ask_slots(8192, 0.4);

    seal::Plaintext bid_pt;
    seal::Plaintext ask_pt;
    client_ctx.encoder->encode(bid_slots, client_ctx.scale, bid_pt);
    client_ctx.encoder->encode(ask_slots, client_ctx.scale, ask_pt);

    seal::Ciphertext bid_ct;
    seal::Ciphertext ask_ct;
    client_ctx.encryptor->encrypt(bid_pt, bid_ct);
    client_ctx.encryptor->encrypt(ask_pt, ask_ct);

    std::vector<double> latencies_ms;
    latencies_ms.reserve(static_cast<std::size_t>(iterations));

    double sample_result_slot0 = 0.0;
    for (int i = 0; i < iterations; ++i) {
        darkpool::MatchRequest req;
        req.set_request_id("bench-" + std::to_string(i + 1));
        req.set_pool_id("default");
        req.set_order_nonce(static_cast<std::uint64_t>(i + 1));
        req.set_use_bfv(false);
        req.set_buy_order(darkpool::serialization::CiphertextToString(bid_ct));
        req.set_sell_order(darkpool::serialization::CiphertextToString(ask_ct));

        darkpool::MatchResponse resp;
        grpc::ClientContext client_call_ctx;

        const auto t0 = Clock::now();
        auto status = stub->ExecuteMatch(&client_call_ctx, req, &resp);
        const auto t1 = Clock::now();

        if (!status.ok() || resp.is_error()) {
            std::cerr << "ExecuteMatch failed: " << status.error_message() << " | "
                      << resp.error_message() << "\n";
            server->Shutdown();
            return 1;
        }

        auto result_ct = darkpool::serialization::StringToCiphertext(
            resp.result_ciphertext(), *client_ctx.context);
        seal::Plaintext out_pt;
        client_ctx.decryptor->decrypt(result_ct, out_pt);
        std::vector<double> decoded;
        client_ctx.encoder->decode(out_pt, decoded);
        if (!decoded.empty()) {
            sample_result_slot0 = decoded[0];
        }

        const auto round_trip_us =
            std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count();
        latencies_ms.push_back(static_cast<double>(round_trip_us) / 1000.0);
    }

    std::sort(latencies_ms.begin(), latencies_ms.end());
    const auto percentile = [&](double p) {
        const std::size_t idx = static_cast<std::size_t>(
            std::ceil((p / 100.0) * static_cast<double>(latencies_ms.size()))) -
            1;
        return latencies_ms[std::min(idx, latencies_ms.size() - 1)];
    };

    const double mean_ms =
        std::accumulate(latencies_ms.begin(), latencies_ms.end(), 0.0) /
        static_cast<double>(latencies_ms.size());
    const double p95_ms = percentile(95.0);
    const double p99_ms = percentile(99.0);

    if (!json_path.empty()) {
        std::ofstream out(json_path, std::ios::trunc);
        out << "{\n"
            << "  \"iterations\": " << iterations << ",\n"
            << "  \"mean_ms\": " << mean_ms << ",\n"
            << "  \"p95_ms\": " << p95_ms << ",\n"
            << "  \"p99_ms\": " << p99_ms << "\n"
            << "}\n";
    }

    std::cout << "[engine_bench] iterations=" << iterations << "\n";
    std::cout << "[engine_bench] mean_ms=" << mean_ms << "\n";
    std::cout << "[engine_bench] p95_ms=" << p95_ms << "\n";
    std::cout << "[engine_bench] p99_ms=" << p99_ms << "\n";
    std::cout << "[engine_bench] result_slot0=" << sample_result_slot0 << "\n";
    std::cout << "[engine_bench] gate_p99_lt_150ms=" << (p99_ms < 150.0 ? "true" : "false")
              << "\n";

    server->Shutdown();
    return p99_ms < 150.0 ? 0 : 2;
}
