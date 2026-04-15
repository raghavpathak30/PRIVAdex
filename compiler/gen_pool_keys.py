import seal
from pathlib import Path

artifacts = Path("artifacts")
artifacts.mkdir(exist_ok=True)

# CKKS keys (degree-27 primary)
ckks_parms = seal.EncryptionParameters(seal.scheme_type.ckks)
ckks_parms.set_poly_modulus_degree(16384)
ckks_parms.set_coeff_modulus(seal.CoeffModulus.Create(16384, [60, 40, 40, 40, 40, 60]))
ckks_ctx = seal.SEALContext(ckks_parms)
ckks_kg = seal.KeyGenerator(ckks_ctx)
ckks_sk = ckks_kg.secret_key()
ckks_pk = seal.PublicKey()
ckks_kg.create_public_key(ckks_pk)
ckks_rlk = seal.RelinKeys()
ckks_kg.create_relin_keys(ckks_rlk)
ckks_gk = seal.GaloisKeys()
ckks_rotations = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
ckks_kg.create_galois_keys(ckks_rotations, ckks_gk)

ckks_pk.save(str(artifacts / "pool_public_key_ckks.bin"))
ckks_sk.save(str(artifacts / "pool_secret_key_ckks.bin"))
ckks_rlk.save(str(artifacts / "pool_relin_keys_ckks.bin"))
ckks_gk.save(str(artifacts / "pool_galois_keys_ckks.bin"))

# BFV keys
bfv_parms = seal.EncryptionParameters(seal.scheme_type.bfv)
bfv_parms.set_poly_modulus_degree(16384)
bfv_parms.set_coeff_modulus(seal.CoeffModulus.Create(16384, [60, 30, 30, 30, 60]))
bfv_parms.set_plain_modulus(65537)
bfv_ctx = seal.SEALContext(bfv_parms)
bfv_kg = seal.KeyGenerator(bfv_ctx)
bfv_sk = bfv_kg.secret_key()
bfv_pk = seal.PublicKey()
bfv_kg.create_public_key(bfv_pk)
bfv_rlk = seal.RelinKeys()
bfv_kg.create_relin_keys(bfv_rlk)
bfv_gk = seal.GaloisKeys()
bfv_kg.create_galois_keys([1, 2, 4, 8, 16, 32, 64, 128, 256], bfv_gk)

bfv_pk.save(str(artifacts / "pool_public_key_bfv.bin"))
bfv_sk.save(str(artifacts / "pool_secret_key_bfv.bin"))
bfv_rlk.save(str(artifacts / "pool_relin_keys_bfv.bin"))
bfv_gk.save(str(artifacts / "pool_galois_keys_bfv.bin"))

print("[gen_pool_keys] All key artifacts written to artifacts/")
print(f"  CKKS rotations: {ckks_rotations}")
print(f"  CKKS galois_keys: {(artifacts / 'pool_galois_keys_ckks.bin').stat().st_size // 1024 // 1024} MB")
print(f"  BFV  galois_keys: {(artifacts / 'pool_galois_keys_bfv.bin').stat().st_size // 1024 // 1024} MB")
