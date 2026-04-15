#pragma once

#include <grpcpp/grpcpp.h>

#include <memory>
#include <string>

#include "bfv_context_dp.h"
#include "ckks_context_dp.h"
#include "darkpool.grpc.pb.h"

class MatchingServiceImpl final : public darkpool::MatchingService::Service {
public:
    MatchingServiceImpl();

    grpc::Status SubmitOrder(
        grpc::ServerContext* context,
        const darkpool::MatchRequest* request,
        darkpool::MatchResponse* response) override;

    grpc::Status ExecuteMatch(
        grpc::ServerContext* context,
        const darkpool::MatchRequest* request,
        darkpool::MatchResponse* response) override;

    grpc::Status Ping(
        grpc::ServerContext* context,
        const darkpool::PingRequest* request,
        darkpool::PongResponse* response) override;

    BFVContextDP& bfv_context() noexcept {
        return bfv_ctx_;
    }

    CKKSContextDP& ckks_context() noexcept {
        return ckks_ctx_;
    }

    const BFVContextDP& bfv_context() const noexcept {
        return bfv_ctx_;
    }

    const CKKSContextDP& ckks_context() const noexcept {
        return ckks_ctx_;
    }

private:
    grpc::Status HandleMatch(
        const darkpool::MatchRequest* request,
        darkpool::MatchResponse* response);

    CKKSContextDP ckks_ctx_;
    BFVContextDP bfv_ctx_;
};

std::unique_ptr<grpc::Server> BuildMatchingServer(const std::string& address);
std::unique_ptr<grpc::Server> BuildMatchingServer(
    const std::string& address,
    const std::shared_ptr<MatchingServiceImpl>& service);
