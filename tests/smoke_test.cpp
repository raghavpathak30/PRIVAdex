#include <seal/seal.h>

#include <cmath>
#include <cstdint>
#include <iostream>
#include <stdexcept>
#include <vector>

#if defined(_OPENMP)
#include <omp.h>
#endif

namespace {

bool has_avx2_compile_support() {
#if defined(__AVX2__)
    return true;
#else
    return false;
#endif
}

bool has_openmp_compile_support() {
#if defined(_OPENMP)
    return true;
#else
    return false;
#endif
}

bool is_seal_compatible() {
#if defined(SEAL_VERSION_MAJOR) && defined(SEAL_VERSION_MINOR) && defined(SEAL_VERSION_PATCH)
    if (SEAL_VERSION_MAJOR != 4 || SEAL_VERSION_MINOR != 1) {
        return false;
    }
    return SEAL_VERSION_PATCH >= 1;
#else
    return false;
#endif
}

int effective_openmp_threads() {
#if defined(_OPENMP)
    return omp_get_max_threads();
#else
    return 0;
#endif
}

}  // namespace

int main() {
    bool ok = true;

    if (is_seal_compatible()) {
        std::cout << "[PASS] SEAL 4.1.x compatible version detected" << std::endl;
    } else {
        std::cout << "[FAIL] Expected SEAL >= 4.1.1 and < 4.2" << std::endl;
        ok = false;
    }

    if (has_avx2_compile_support()) {
        std::cout << "[PASS] AVX2 compile support enabled" << std::endl;
    } else {
        std::cout << "[FAIL] AVX2 compile support missing (__AVX2__ not set)" << std::endl;
        ok = false;
    }

    if (has_openmp_compile_support() && effective_openmp_threads() > 0) {
        std::cout << "[PASS] OpenMP enabled (max threads=" << effective_openmp_threads() << ")" << std::endl;
    } else {
        std::cout << "[FAIL] OpenMP support missing (_OPENMP not set)" << std::endl;
        ok = false;
    }

    seal::EncryptionParameters parms(seal::scheme_type::ckks);
    parms.set_poly_modulus_degree(16384);
    parms.set_coeff_modulus(seal::CoeffModulus::Create(16384, {60, 40, 40, 40, 60}));

    auto context = seal::SEALContext(parms);
    if (!context.parameters_set()) {
        std::cout << "[FAIL] SEAL context rejected parameters" << std::endl;
        return 1;
    }

    seal::KeyGenerator keygen(context);
    seal::PublicKey pk;
    keygen.create_public_key(pk);
    seal::SecretKey sk = keygen.secret_key();

    seal::CKKSEncoder encoder(context);
    seal::Encryptor encryptor(context, pk);
    seal::Decryptor decryptor(context, sk);

    const double scale = std::pow(2.0, 40);
    std::vector<double> input(encoder.slot_count(), 0.0);
    input[0] = 0.125;
    input[1] = -0.375;

    seal::Plaintext plain;
    encoder.encode(input, scale, plain);

    seal::Ciphertext cipher;
    encryptor.encrypt(plain, cipher);

    int noise_budget = -1;
    try {
        noise_budget = decryptor.invariant_noise_budget(cipher);
    } catch (const std::logic_error&) {
        // CKKS noise-budget query can be unsupported depending on SEAL build.
    }

    seal::Plaintext decoded_plain;
    decryptor.decrypt(cipher, decoded_plain);

    std::vector<double> output;
    encoder.decode(decoded_plain, output);

    const double err0 = std::abs(output[0] - input[0]);
    const double err1 = std::abs(output[1] - input[1]);
    const double max_err = std::max(err0, err1);

    if ((noise_budget == -1 || noise_budget > 0) && max_err < 1e-4) {
        if (noise_budget == -1) {
            std::cout << "[PASS] CKKS round-trip (noise budget=unsupported, max error="
                      << max_err << ")" << std::endl;
        } else {
            std::cout << "[PASS] CKKS round-trip (noise budget=" << noise_budget
                      << ", max error=" << max_err << ")" << std::endl;
        }
    } else {
        std::cout << "[FAIL] CKKS round-trip failed (noise budget=" << noise_budget
                  << ", max error=" << max_err << ")" << std::endl;
        ok = false;
    }

    return ok ? 0 : 1;
}
