#include "matching_server.h"

#include "bfv_equality_eval.h"
#include "seal_serialization.h"
#include "sign_poly_eval.h"
#include "slot_blinding.h"

#include <array>
#include <ctime>
#include <mutex>
#include <random>
#include <stdexcept>

#include "sqlite3_compat.h"

namespace {

class SqliteNonceStore {
public:
    SqliteNonceStore() {
        if (sqlite3_open(":memory:", &db_) != SQLITE_OK) {
            throw std::runtime_error("failed to open nonce store database");
        }

        const char* create_sql =
            "CREATE TABLE IF NOT EXISTS nonces ("
            "nonce BLOB PRIMARY KEY, "
            "trader_id TEXT NOT NULL, "
            "timestamp INTEGER NOT NULL)";
        char* error_message = nullptr;
        if (sqlite3_exec(db_, create_sql, nullptr, nullptr, &error_message) != SQLITE_OK) {
            std::string message = error_message ? error_message : "failed to create nonce table";
            sqlite3_free(error_message);
            throw std::runtime_error(message);
        }
    }

    ~SqliteNonceStore() {
        if (db_) {
            sqlite3_close(db_);
        }
    }

    bool InsertNonce(const std::string& nonce_bytes, const std::string& trader_id) {
        if (nonce_bytes.size() != 16 || trader_id.empty()) {
            return false;
        }

        std::lock_guard<std::mutex> guard(mutex_);

        sqlite3_stmt* statement = nullptr;
        const char* insert_sql =
            "INSERT INTO nonces (nonce, trader_id, timestamp) VALUES (?, ?, ?)";
        if (sqlite3_prepare_v2(db_, insert_sql, -1, &statement, nullptr) != SQLITE_OK) {
            return false;
        }

        const auto timestamp = static_cast<sqlite3_int64>(std::time(nullptr));
        sqlite3_bind_blob(statement, 1, nonce_bytes.data(), static_cast<int>(nonce_bytes.size()), SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, trader_id.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(statement, 3, timestamp);

        const int step_result = sqlite3_step(statement);
        sqlite3_finalize(statement);
        return step_result == SQLITE_DONE;
    }

private:
    sqlite3* db_ = nullptr;
    std::mutex mutex_;
};

SqliteNonceStore& NonceStore() {
    static SqliteNonceStore store;
    return store;
}

bool ReserveNonce(const std::string& trader_id, const std::string& nonce_bytes) {
    return NonceStore().InsertNonce(nonce_bytes, trader_id);
}

}  // namespace

grpc::Status MatchingServiceImpl::HandleMatch(
    const darkpool::MatchRequest* request,
    darkpool::MatchResponse* response) {
    try {
        if (!request) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "null request");
        }

        response->set_request_id(request->request_id());

        if (request->buy_order().empty() || request->sell_order().empty()) {
            response->set_is_error(true);
            response->set_error_message("buy_order/sell_order ciphertext bytes must be present");
            return grpc::Status::OK;
        }

        seal::Ciphertext result;

        if (request->use_bfv()) {
            auto enc_buy = darkpool::serialization::StringToCiphertext(
                request->buy_order(), *bfv_ctx_.context);
            auto enc_sell = darkpool::serialization::StringToCiphertext(
                request->sell_order(), *bfv_ctx_.context);

            result = bfv_equality_eval(
                enc_buy,
                enc_sell,
                *bfv_ctx_.evaluator,
                bfv_ctx_.relin_keys,
                *bfv_ctx_.encryptor,
                *bfv_ctx_.batch_encoder,
                bfv_ctx_.params.plain_modulus().value());

            static const std::array<int, 4> kBfvBlindOffsets = {1, 2, 4, 8};
            std::random_device rd;
            std::uniform_int_distribution<std::size_t> dist(0, kBfvBlindOffsets.size() - 1);
            const int blind_offset = kBfvBlindOffsets[dist(rd)];
            if (blind_offset > 0) {
                seal::Ciphertext blinded;
                try {
                    bfv_ctx_.evaluator->rotate_rows(
                        result, blind_offset, bfv_ctx_.galois_keys, blinded);
                    result = std::move(blinded);
                } catch (const std::exception&) {
                }
            }
        } else {
            auto enc_buy = darkpool::serialization::StringToCiphertext(
                request->buy_order(), *ckks_ctx_.context);
            auto enc_sell = darkpool::serialization::StringToCiphertext(
                request->sell_order(), *ckks_ctx_.context);

            if (enc_buy.parms_id() != enc_sell.parms_id()) {
                auto buy_data = ckks_ctx_.context->get_context_data(enc_buy.parms_id());
                auto sell_data = ckks_ctx_.context->get_context_data(enc_sell.parms_id());
                if (!buy_data || !sell_data) {
                    throw std::runtime_error("invalid parms_id in request ciphertexts");
                }
                if (buy_data->chain_index() > sell_data->chain_index()) {
                    ckks_ctx_.evaluator->mod_switch_to_inplace(enc_buy, enc_sell.parms_id());
                } else {
                    ckks_ctx_.evaluator->mod_switch_to_inplace(enc_sell, enc_buy.parms_id());
                }
            }

            seal::Ciphertext enc_diff;
            ckks_ctx_.evaluator->sub(enc_buy, enc_sell, enc_diff);
            result = sign_poly_eval_d27(
                enc_diff,
                *ckks_ctx_.evaluator,
                *ckks_ctx_.encoder,
                ckks_ctx_.relin_keys,
                ckks_ctx_);
        }

        response->set_result_ciphertext(darkpool::serialization::CiphertextToString(result));
        response->set_is_error(false);
        response->set_error_message("");
        response->set_match_certificate("");
        return grpc::Status::OK;
    } catch (const std::exception& ex) {
        response->set_is_error(true);
        response->set_error_message(ex.what());
        return grpc::Status::OK;
    }
}

MatchingServiceImpl::MatchingServiceImpl() : ckks_ctx_(true), bfv_ctx_() {}

grpc::Status MatchingServiceImpl::SubmitOrder(
    grpc::ServerContext*,
    const darkpool::MatchRequest* request,
    darkpool::MatchResponse* response) {
    try {
        if (!request) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "null request");
        }
        if (request->trader_id().empty()) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "trader_id must be present");
        }
        if (request->nonce().size() != 16) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "nonce must be exactly 16 bytes");
        }
        if (!ReserveNonce(request->trader_id(), request->nonce())) {
            return grpc::Status(grpc::StatusCode::ALREADY_EXISTS, "replay detected");
        }
        return HandleMatch(request, response);
    } catch (const std::exception& ex) {
        return grpc::Status(grpc::StatusCode::INTERNAL, ex.what());
    }
}

grpc::Status MatchingServiceImpl::ExecuteMatch(
    grpc::ServerContext*,
    const darkpool::MatchRequest* request,
    darkpool::MatchResponse* response) {
    return HandleMatch(request, response);
}

grpc::Status MatchingServiceImpl::Ping(
    grpc::ServerContext*,
    const darkpool::PingRequest* request,
    darkpool::PongResponse* response) {
    if (!request || !response) {
        return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "null ping request/response");
    }
    response->set_message("pong:" + request->message());
    return grpc::Status::OK;
}

std::unique_ptr<grpc::Server> BuildMatchingServer(const std::string& address) {
    static auto default_service = std::make_shared<MatchingServiceImpl>();
    return BuildMatchingServer(address, default_service);
}

std::unique_ptr<grpc::Server> BuildMatchingServer(
    const std::string& address,
    const std::shared_ptr<MatchingServiceImpl>& service) {
    grpc::ServerBuilder builder;
    builder.AddListeningPort(address, grpc::InsecureServerCredentials());
    builder.RegisterService(service.get());
    return builder.BuildAndStart();
}
