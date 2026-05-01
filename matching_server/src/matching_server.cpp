#include "matching_server.h"

#include "bfv_equality_eval.h"
#include "seal_serialization.h"
#include "sign_poly_eval.h"
#include "slot_blinding.h"

#include <array>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <iostream>
#include <mutex>
#include <random>
#include <regex>
#include <stdexcept>
#include <unordered_map>
#include <vector>
#include <unistd.h>

#include "sqlite3_compat.h"

namespace {

class SqliteNonceStore {
public:
    SqliteNonceStore() {
        const char* db_path_env = std::getenv("DARKPOOL_NONCE_DB");
        const std::string db_path = (db_path_env && *db_path_env)
            ? db_path_env
            : ("nonce_store_" + std::to_string(getpid()) + ".sqlite");
        if (sqlite3_open(db_path.c_str(), &db_) != SQLITE_OK) {
            throw std::runtime_error("failed to open nonce store database");
        }

        sqlite3_exec(db_, "PRAGMA journal_mode=WAL", nullptr, nullptr, nullptr);

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

        const auto now_ts = static_cast<sqlite3_int64>(std::time(nullptr));
        const auto expiry_floor = now_ts - static_cast<sqlite3_int64>(300);
        {
            sqlite3_stmt* gc_statement = nullptr;
            const char* gc_sql = "DELETE FROM nonces WHERE timestamp < ?";
            if (sqlite3_prepare_v2(db_, gc_sql, -1, &gc_statement, nullptr) == SQLITE_OK) {
                sqlite3_bind_int64(gc_statement, 1, expiry_floor);
                sqlite3_step(gc_statement);
            }
            if (gc_statement) {
                sqlite3_finalize(gc_statement);
            }
        }

        sqlite3_stmt* statement = nullptr;
        const char* insert_sql =
            "INSERT INTO nonces (nonce, trader_id, timestamp) VALUES (?, ?, ?)";
        if (sqlite3_prepare_v2(db_, insert_sql, -1, &statement, nullptr) != SQLITE_OK) {
            return false;
        }

        sqlite3_bind_blob(statement, 1, nonce_bytes.data(), static_cast<int>(nonce_bytes.size()), SQLITE_TRANSIENT);
        sqlite3_bind_text(statement, 2, trader_id.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(statement, 3, now_ts);

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

bool IsDummyRequest(const std::string& request_id) {
    return request_id.rfind("dummy:", 0) == 0;
}

std::unordered_map<std::string, bool> BuildDefaultPoolRegistry() {
    return {{"default", true}};
}

void ParseRegistryEntries(
    const std::string& object_body,
    std::unordered_map<std::string, bool>& registry) {
    static const std::regex entry_regex("\"([^\"]+)\"\\s*:\\s*(true|false)");
    for (std::sregex_iterator it(object_body.begin(), object_body.end(), entry_regex), end;
         it != end;
         ++it) {
        registry[(*it)[1].str()] = ((*it)[2].str() == "true");
    }
}

std::unordered_map<std::string, bool> LoadPoolSchemeRegistry() {
    auto registry = BuildDefaultPoolRegistry();

    std::ifstream in("settlement_config.json");
    if (!in.good()) {
        return registry;
    }

    const std::string config((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    const std::string key = "\"pool_scheme_registry\"";
    const std::size_t key_pos = config.find(key);
    if (key_pos == std::string::npos) {
        return registry;
    }

    const std::size_t obj_start = config.find('{', key_pos);
    if (obj_start == std::string::npos) {
        return registry;
    }

    int depth = 0;
    std::size_t obj_end = std::string::npos;
    for (std::size_t i = obj_start; i < config.size(); ++i) {
        if (config[i] == '{') {
            ++depth;
        } else if (config[i] == '}') {
            --depth;
            if (depth == 0) {
                obj_end = i;
                break;
            }
        }
    }

    if (obj_end == std::string::npos || obj_end <= obj_start + 1) {
        return registry;
    }

    ParseRegistryEntries(config.substr(obj_start + 1, obj_end - obj_start - 1), registry);
    return registry;
}

std::string SerializeCiphertextZstd(const seal::Ciphertext& ct) {
    const auto mode = seal::Serialization::IsSupportedComprMode(seal::compr_mode_type::zstd)
        ? seal::compr_mode_type::zstd
        : seal::compr_mode_type::none;

    std::vector<seal::seal_byte> out_buf(4 * 1024 * 1024);
    const std::size_t required = ct.save_size(mode);
    if (required > out_buf.size()) {
        out_buf.resize(required);
    }

    const std::size_t written = ct.save(out_buf.data(), out_buf.size(), mode);
    return std::string(
        reinterpret_cast<const char*>(out_buf.data()),
        reinterpret_cast<const char*>(out_buf.data()) + written);
}

}  // namespace

grpc::Status MatchingServiceImpl::HandleMatch(
    const darkpool::MatchRequest* request,
    darkpool::MatchResponse* response,
    bool use_bfv) {
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

        std::lock_guard<std::mutex> guard(eval_mutex_);

        if (use_bfv) {
            seal::Evaluator bfv_ev(*bfv_ctx_.context);
            seal::Encryptor bfv_encryptor(*bfv_ctx_.context, bfv_ctx_.public_key);
            seal::BatchEncoder bfv_batch_encoder(*bfv_ctx_.context);

            auto enc_buy = darkpool::serialization::StringToCiphertext(
                request->buy_order(), *bfv_ctx_.context);
            auto enc_sell = darkpool::serialization::StringToCiphertext(
                request->sell_order(), *bfv_ctx_.context);

            result = bfv_equality_eval(
                enc_buy,
                enc_sell,
                bfv_ev,
                bfv_ctx_.relin_keys,
                bfv_encryptor,
                bfv_batch_encoder,
                bfv_ctx_.params.plain_modulus().value());

            static const std::array<int, 4> kBfvBlindOffsets = {1, 2, 4, 8};
            std::random_device rd;
            std::uniform_int_distribution<std::size_t> dist(0, kBfvBlindOffsets.size() - 1);
            const int blind_offset = kBfvBlindOffsets[dist(rd)];
            if (blind_offset > 0) {
                seal::Ciphertext blinded;
                try {
                    bfv_ev.rotate_rows(
                        result, blind_offset, bfv_ctx_.galois_keys, blinded);
                    result = std::move(blinded);
                } catch (const std::exception&) {
                }
            }
        } else {
            seal::Evaluator ckks_ev(*ckks_ctx_.context);
            seal::CKKSEncoder ckks_encoder(*ckks_ctx_.context);

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
                    ckks_ev.mod_switch_to_inplace(enc_buy, enc_sell.parms_id());
                } else {
                    ckks_ev.mod_switch_to_inplace(enc_sell, enc_buy.parms_id());
                }
            }

            seal::Ciphertext enc_diff;
            ckks_ev.sub(enc_buy, enc_sell, enc_diff);
            result = sign_poly_eval_d27(
                enc_diff,
                ckks_ev,
                ckks_encoder,
                ckks_ctx_.relin_keys,
                ckks_ctx_);
        }

        response->set_result_ciphertext(SerializeCiphertextZstd(result));
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

MatchingServiceImpl::MatchingServiceImpl()
    : ckks_ctx_(true), bfv_ctx_(), pool_scheme_registry_(LoadPoolSchemeRegistry()) {}

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
        const auto pool_it = pool_scheme_registry_.find(request->pool_id());
        if (pool_it == pool_scheme_registry_.end()) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "ERR_PARAM_MISMATCH: unknown pool_id");
        }
        if (!ReserveNonce(request->trader_id(), request->nonce())) {
            return grpc::Status(grpc::StatusCode::ALREADY_EXISTS, "replay detected");
        }

        const bool is_dummy = IsDummyRequest(request->request_id());
        std::cout << "[submit_order_received] request_id=" << request->request_id()
                  << " trader_id=" << request->trader_id()
                  << " dummy=" << (is_dummy ? 1 : 0) << std::endl;

        if (is_dummy) {
            response->set_request_id(request->request_id());
            response->set_is_error(false);
            response->set_error_message("");
            response->set_match_certificate("");
            response->set_result_ciphertext("");
            return grpc::Status::OK;
        }

        return HandleMatch(request, response, pool_it->second);
    } catch (const std::exception& ex) {
        return grpc::Status(grpc::StatusCode::INTERNAL, ex.what());
    }
}

grpc::Status MatchingServiceImpl::ExecuteMatch(
    grpc::ServerContext*,
    const darkpool::MatchRequest* request,
    darkpool::MatchResponse* response) {
    const bool use_bfv = request ? request->use_bfv() : false;
    return HandleMatch(request, response, use_bfv);
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
