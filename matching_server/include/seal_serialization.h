#pragma once

#include <seal/seal.h>

#include <string>

namespace darkpool::serialization {

std::string CiphertextToString(const seal::Ciphertext& ct);

seal::Ciphertext StringToCiphertext(const std::string& s, const seal::SEALContext& context);

}  // namespace darkpool::serialization
