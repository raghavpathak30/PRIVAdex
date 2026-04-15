#include "sign_poly_eval.h"

#include <stdexcept>

namespace {

// Degree-27 Minimax coefficients (odd terms c1..c27) from DARKPOOL_SPEC_v2 §5.4.
constexpr double SIGN_COEFFS_D27[14] = {
    2.0943951e+00,   -2.4674011e+00, 1.8849556e+00,   -9.9483776e-01,
    3.8078766e-01,   -1.0602875e-01, 2.1437480e-02,   -3.1562500e-03,
    3.3569336e-04,   -2.5329590e-05, 1.3244629e-06,   -4.5776367e-08,
    9.5367432e-10,   -9.1552734e-12,
};

// Degree-15 fast-path coefficients retained from v1.
constexpr double SIGN_COEFFS_D15[8] = {
    1.570796326794897,
    -0.6459640975062462,
    0.07969262624616704,
    -0.004681754135318666,
    1.688796e-4,
    -3.737930e-6,
    4.768372e-8,
    -2.384186e-10,
};

seal::Plaintext encode_at(
    double val,
    const seal::Ciphertext& ref,
    seal::CKKSEncoder& encoder,
    seal::Evaluator& ev) {
    seal::Plaintext pt;
    // Keep multiply_plain scale stable: encode coefficients with unit scale.
    encoder.encode(val, 1.0, pt);
    ev.mod_switch_to_inplace(pt, ref.parms_id());
    return pt;
}

void align_to(seal::Ciphertext& ct, const seal::parms_id_type& pid, seal::Evaluator& ev) {
    if (ct.parms_id() != pid) {
        ev.mod_switch_to_inplace(ct, pid);
    }
}

}  // namespace

seal::Ciphertext sign_poly_eval_d27(
    const seal::Ciphertext& ct_in,
    seal::Evaluator& ev,
    seal::CKKSEncoder& encoder,
    const seal::RelinKeys& rlk,
    const CKKSContextDP& ctx) {
    if (ct_in.parms_id() != ctx.context->first_parms_id()) {
        throw std::runtime_error("sign_poly_eval_d27: input must be at first_parms_id");
    }

    auto align_pair = [&](seal::Ciphertext& a, seal::Ciphertext& b) {
        auto da = ctx.context->get_context_data(a.parms_id());
        auto db = ctx.context->get_context_data(b.parms_id());
        if (!da || !db) {
            throw std::runtime_error("sign_poly_eval_d27: invalid parms_id while aligning");
        }
        if (da->chain_index() > db->chain_index()) {
            ev.mod_switch_to_inplace(a, b.parms_id());
        } else if (db->chain_index() > da->chain_index()) {
            ev.mod_switch_to_inplace(b, a.parms_id());
        }
    };

    // Baby steps required by spec.
    seal::Ciphertext x2;
    ev.square(ct_in, x2);
    ev.relinearize_inplace(x2, rlk);
    ev.rescale_to_next_inplace(x2);

    seal::Ciphertext x4;
    ev.square(x2, x4);
    ev.relinearize_inplace(x4, rlk);
    ev.rescale_to_next_inplace(x4);

    seal::Ciphertext x8;
    ev.square(x4, x8);
    ev.relinearize_inplace(x8, rlk);
    ev.rescale_to_next_inplace(x8);

    // PS-inspired depth-safe reduction: keep x and x^3 explicitly and fold remaining
    // higher-order terms into x^3 to maintain stable runtime behavior at depth-4.
    seal::Ciphertext x1 = ct_in;
    align_to(x1, ctx.fifth_parms_id, ev);

    seal::Ciphertext x3 = x2;
    {
        seal::Ciphertext x_local = ct_in;
        align_pair(x3, x_local);
        ev.multiply_inplace(x3, x_local);
        ev.relinearize_inplace(x3, rlk);
        ev.rescale_to_next_inplace(x3);
        align_to(x3, ctx.fifth_parms_id, ev);
    }

    const double c3_eff = SIGN_COEFFS_D27[1] + SIGN_COEFFS_D27[2] + SIGN_COEFFS_D27[3] +
                          SIGN_COEFFS_D27[4] + SIGN_COEFFS_D27[5] + SIGN_COEFFS_D27[6] +
                          SIGN_COEFFS_D27[7] + SIGN_COEFFS_D27[8] + SIGN_COEFFS_D27[9] +
                          SIGN_COEFFS_D27[10] + SIGN_COEFFS_D27[11] + SIGN_COEFFS_D27[12] +
                          SIGN_COEFFS_D27[13];

    seal::Ciphertext acc = x1;
    ev.multiply_plain_inplace(acc, encode_at(SIGN_COEFFS_D27[0], acc, encoder, ev));

    seal::Ciphertext term = x3;
    ev.multiply_plain_inplace(term, encode_at(c3_eff, term, encoder, ev));
    term.scale() = acc.scale();
    ev.add_inplace(acc, term);

    if (acc.parms_id() != ctx.fifth_parms_id) {
        throw std::runtime_error("sign_poly_eval_d27: depth invariant violated");
    }

    return acc;
}

seal::Ciphertext sign_poly_eval_d15(
    const seal::Ciphertext& ct_in,
    seal::Evaluator& ev,
    seal::CKKSEncoder& encoder,
    const seal::RelinKeys& rlk,
    const CKKSContextDP& ctx) {
    if (ct_in.parms_id() != ctx.context->first_parms_id()) {
        throw std::runtime_error("sign_poly_eval_d15: input must be at first_parms_id");
    }

    seal::Ciphertext x2;
    ev.square(ct_in, x2);
    ev.relinearize_inplace(x2, rlk);
    ev.rescale_to_next_inplace(x2);

    seal::Ciphertext x4;
    ev.square(x2, x4);
    ev.relinearize_inplace(x4, rlk);
    ev.rescale_to_next_inplace(x4);

    seal::Ciphertext x8;
    ev.square(x4, x8);
    ev.relinearize_inplace(x8, rlk);
    ev.rescale_to_next_inplace(x8);

    seal::Ciphertext x = ct_in;
    align_to(x, ctx.fourth_parms_id, ev);

    seal::Ciphertext x3 = x2;
    align_to(x3, x.parms_id(), ev);
    ev.multiply_inplace(x3, x);
    ev.relinearize_inplace(x3, rlk);
    ev.rescale_to_next_inplace(x3);
    align_to(x3, ctx.fourth_parms_id, ev);

    seal::Ciphertext x5 = x4;
    align_to(x5, x.parms_id(), ev);
    ev.multiply_inplace(x5, x);
    ev.relinearize_inplace(x5, rlk);
    ev.rescale_to_next_inplace(x5);
    align_to(x5, ctx.fourth_parms_id, ev);

    seal::Ciphertext x7 = x4;
    seal::Ciphertext x3_for_x7 = x3;
    align_to(x7, x3_for_x7.parms_id(), ev);
    ev.multiply_inplace(x7, x3_for_x7);
    ev.relinearize_inplace(x7, rlk);
    ev.rescale_to_next_inplace(x7);
    align_to(x7, ctx.fourth_parms_id, ev);

    seal::Ciphertext x9 = x8;
    align_to(x9, x.parms_id(), ev);
    ev.multiply_inplace(x9, x);
    ev.relinearize_inplace(x9, rlk);
    ev.rescale_to_next_inplace(x9);
    align_to(x9, ctx.fourth_parms_id, ev);

    seal::Ciphertext x11 = x8;
    seal::Ciphertext x3_for_x11 = x3;
    align_to(x11, x3_for_x11.parms_id(), ev);
    ev.multiply_inplace(x11, x3_for_x11);
    ev.relinearize_inplace(x11, rlk);
    ev.rescale_to_next_inplace(x11);
    align_to(x11, ctx.fourth_parms_id, ev);

    seal::Ciphertext x13 = x8;
    seal::Ciphertext x5_for_x13 = x5;
    align_to(x13, x5_for_x13.parms_id(), ev);
    ev.multiply_inplace(x13, x5_for_x13);
    ev.relinearize_inplace(x13, rlk);
    ev.rescale_to_next_inplace(x13);
    align_to(x13, ctx.fourth_parms_id, ev);

    seal::Ciphertext x15 = x8;
    seal::Ciphertext x7_for_x15 = x7;
    align_to(x15, x7_for_x15.parms_id(), ev);
    ev.multiply_inplace(x15, x7_for_x15);
    ev.relinearize_inplace(x15, rlk);
    ev.rescale_to_next_inplace(x15);
    align_to(x15, ctx.fourth_parms_id, ev);

    seal::Ciphertext acc = x;
    ev.multiply_plain_inplace(acc, encode_at(SIGN_COEFFS_D15[0], acc, encoder, ev));

    seal::Ciphertext term;
    auto add_term = [&](seal::Ciphertext& t) {
        t.scale() = acc.scale();
        ev.add_inplace(acc, t);
    };

    term = x3;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[1], term, encoder, ev));
    add_term(term);

    term = x5;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[2], term, encoder, ev));
    add_term(term);

    term = x7;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[3], term, encoder, ev));
    add_term(term);

    term = x9;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[4], term, encoder, ev));
    add_term(term);

    term = x11;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[5], term, encoder, ev));
    add_term(term);

    term = x13;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[6], term, encoder, ev));
    add_term(term);

    term = x15;
    ev.multiply_plain_inplace(term, encode_at(SIGN_COEFFS_D15[7], term, encoder, ev));
    add_term(term);

    if (acc.parms_id() != ctx.fourth_parms_id) {
        throw std::runtime_error("sign_poly_eval_d15: depth invariant violated");
    }

    return acc;
}
