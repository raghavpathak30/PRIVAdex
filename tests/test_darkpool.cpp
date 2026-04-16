#include <catch2/catch_all.hpp>

#include <cmath>
#include <cstdint>
#include <vector>

#include "bfv_context_dp.h"
#include "bfv_equality_eval.h"
#include "ckks_context_dp.h"
#include "hoisted_tree_sum_dp.h"
#include "order_encoder.h"
#include "sign_poly_eval.h"
#include "slot_blinding.h"

TEST_CASE("CKKSContextDP: noise budget positive after depth-4 (degree-27)", "[context]") {
    REQUIRE_NOTHROW(CKKSContextDP(true));
}

TEST_CASE("CKKSContextDP: noise budget positive after depth-3 (degree-15)", "[context]") {
    REQUIRE_NOTHROW(CKKSContextDP(false));
}

TEST_CASE("BFVContextDP: construction succeeds", "[context]") {
    REQUIRE_NOTHROW(BFVContextDP());
}

TEST_CASE("order_encoder: CKKS slot layout", "[encoder]") {
    auto tiled = encode_order_batch({0.6}, {0.4}, {1.0}, 1);
    REQUIRE(tiled.size() == 8192);
    REQUIRE(std::abs(tiled[0] - 0.6) < 1e-9);
    REQUIRE(std::abs(tiled[1] - 1.0) < 1e-9);
    REQUIRE(std::abs(tiled[256] - 0.4) < 1e-9);
}

TEST_CASE("bfv_equality_eval: result == 1 when bid == ask", "[bfv]") {
    BFVContextDP ctx;
    std::vector<std::uint64_t> bids(16384, 100ULL), asks(16384, 100ULL);
    seal::Plaintext pt_bid, pt_ask;
    ctx.batch_encoder->encode(bids, pt_bid);
    ctx.batch_encoder->encode(asks, pt_ask);

    seal::Ciphertext enc_bid, enc_ask;
    ctx.encryptor->encrypt(pt_bid, enc_bid);
    ctx.encryptor->encrypt(pt_ask, enc_ask);

    auto result = bfv_equality_eval(
        enc_bid,
        enc_ask,
        *ctx.evaluator,
        ctx.relin_keys,
        *ctx.encryptor,
        *ctx.batch_encoder,
        ctx.params.plain_modulus().value());

    seal::Plaintext out_pt;
    ctx.decryptor->decrypt(result, out_pt);
    const int budget = ctx.decryptor->invariant_noise_budget(result);
    std::vector<std::uint64_t> out;
    ctx.batch_encoder->decode(out_pt, out);
    REQUIRE(out[0] == 1ULL);
    REQUIRE(budget > 0);
}

TEST_CASE("bfv_equality_eval: result == 0 when bid != ask", "[bfv]") {
    BFVContextDP ctx;
    std::vector<std::uint64_t> bids(16384, 100ULL), asks(16384, 101ULL);
    seal::Plaintext pt_bid, pt_ask;
    ctx.batch_encoder->encode(bids, pt_bid);
    ctx.batch_encoder->encode(asks, pt_ask);

    seal::Ciphertext enc_bid, enc_ask;
    ctx.encryptor->encrypt(pt_bid, enc_bid);
    ctx.encryptor->encrypt(pt_ask, enc_ask);

    auto result = bfv_equality_eval(
        enc_bid,
        enc_ask,
        *ctx.evaluator,
        ctx.relin_keys,
        *ctx.encryptor,
        *ctx.batch_encoder,
        ctx.params.plain_modulus().value());

    seal::Plaintext out_pt;
    ctx.decryptor->decrypt(result, out_pt);
    const int budget = ctx.decryptor->invariant_noise_budget(result);
    std::vector<std::uint64_t> out;
    ctx.batch_encoder->decode(out_pt, out);
    REQUIRE(out[0] == 0ULL);
    REQUIRE(budget > 0);
}

TEST_CASE("sign_poly_eval: depth invariant (degree-27)", "[sign]") {
    CKKSContextDP ctx(true);
    auto eval_slot0 = [&](double v) {
        std::vector<double> x(8192, v);
        seal::Plaintext pt;
        ctx.encoder->encode(x, ctx.scale, pt);

        seal::Ciphertext ct;
        ctx.encryptor->encrypt(pt, ct);

        auto result = sign_poly_eval_d27(ct, *ctx.evaluator, *ctx.encoder, ctx.relin_keys, ctx);
        REQUIRE(result.parms_id() == ctx.fifth_parms_id);

        seal::Plaintext out_pt;
        ctx.decryptor->decrypt(result, out_pt);
        std::vector<double> decoded;
        ctx.encoder->decode(out_pt, decoded);
        return decoded[0];
    };

    const double s_pos_half = eval_slot0(0.5);
    const double s_neg_half = eval_slot0(-0.5);
    const double s_pos_tenth = eval_slot0(0.1);
    const double s_neg_tenth = eval_slot0(-0.1);
    const double s_zero = eval_slot0(0.0);

    REQUIRE(s_pos_half >= 0.75);
    REQUIRE(s_pos_half <= 0.90);

    REQUIRE(s_neg_half >= -0.90);
    REQUIRE(s_neg_half <= -0.75);

    REQUIRE(s_pos_tenth >= 0.15);
    REQUIRE(s_pos_tenth <= 0.30);

    REQUIRE(s_neg_tenth >= -0.30);
    REQUIRE(s_neg_tenth <= -0.15);

    REQUIRE(s_zero >= -0.1);
    REQUIRE(s_zero <= 0.1);
}

TEST_CASE("slot_blinding: blind + unblind is identity", "[blinding]") {
    CKKSContextDP ctx(false);
    std::vector<double> x(8192, 0.5);
    seal::Plaintext pt;
    ctx.encoder->encode(x, ctx.scale, pt);

    seal::Ciphertext ct;
    ctx.encryptor->encrypt(pt, ct);

    const int offset = 3;
    auto blind = apply_slot_blind(ct, offset, ctx.galois_keys, *ctx.evaluator);
    auto unblind = remove_slot_blind(blind, offset, ctx.galois_keys, *ctx.evaluator);

    seal::Plaintext p1, p2;
    ctx.decryptor->decrypt(ct, p1);
    ctx.decryptor->decrypt(unblind, p2);

    std::vector<double> d1, d2;
    ctx.encoder->decode(p1, d1);
    ctx.encoder->decode(p2, d2);
    REQUIRE(std::abs(d1[0] - d2[0]) < 1e-4);
}
