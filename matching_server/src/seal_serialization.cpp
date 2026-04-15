#include "seal_serialization.h"

#include <sstream>
#include <stdexcept>

namespace darkpool::serialization {

namespace {

seal::compr_mode_type preferred_compression() {
    if (seal::Serialization::IsSupportedComprMode(seal::compr_mode_type::zstd)) {
        return seal::compr_mode_type::zstd;
    }
    if (seal::Serialization::IsSupportedComprMode(seal::compr_mode_type::zlib)) {
        return seal::compr_mode_type::zlib;
    }
    return seal::compr_mode_type::none;
}

}  // namespace

std::string CiphertextToString(const seal::Ciphertext& ct) {
    std::ostringstream oss(std::ios::binary);
    ct.save(oss, preferred_compression());
    return oss.str();
}

seal::Ciphertext StringToCiphertext(const std::string& s, const seal::SEALContext& context) {
    std::istringstream iss(s, std::ios::binary);
    seal::Ciphertext ct;
    ct.load(context, iss);
    if (!iss.good() && !iss.eof()) {
        throw std::runtime_error("StringToCiphertext: failed to deserialize ciphertext bytes");
    }
    return ct;
}

}  // namespace darkpool::serialization
