from __future__ import annotations

import numpy as np

# Keep this list aligned with SIGN_COEFFS_D27 in he_core/src/sign_poly_eval.cpp.
SIGN_COEFFS_D27 = np.array(
    [
        2.0943951e00,
        -2.4674011e00,
        1.8849556e00,
        -9.9483776e-01,
        3.8078766e-01,
        -1.0602875e-01,
        2.1437480e-02,
        -3.1562500e-03,
        3.3569336e-04,
        -2.5329590e-05,
        1.3244629e-06,
        -4.5776367e-08,
        9.5367432e-10,
        -9.1552734e-12,
    ],
    dtype=np.float64,
)


def poly_eval(x: np.ndarray) -> np.ndarray:
    out = np.zeros_like(x)
    for i, c in enumerate(SIGN_COEFFS_D27):
        out += c * np.power(x, 2 * i + 1)
    return out


def main() -> int:
    x = np.linspace(-1.0, 1.0, 1000)
    mask = np.abs(x) > 0.05
    p = poly_eval(x)
    err = np.max(np.abs(p[mask] - np.sign(x[mask])))

    # Degree-27 odd polynomial approximates sign outside a dead zone, but
    # Gibbs oscillation near |x| ~= 0.05 limits the best achievable sup error.
    assert err < 0.35, f"sign polynomial max error too high: {err}"
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
