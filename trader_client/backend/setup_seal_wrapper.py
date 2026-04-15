from setuptools import setup
from pybind11.setup_helpers import Pybind11Extension, build_ext

ext_modules = [
    Pybind11Extension(
        "seal_wrapper_dp",
        ["seal_wrapper_dp.cpp"],
        include_dirs=["/usr/local/include/SEAL-4.1"],
        libraries=["seal-4.1"],
        library_dirs=["/usr/local/lib"],
        extra_compile_args=["-O3", "-std=c++17", "-march=native", "-fopenmp"],
        extra_link_args=["-fopenmp"],
        cxx_std=17,
    )
]

setup(
    name="seal_wrapper_dp",
    ext_modules=ext_modules,
    cmdclass={"build_ext": build_ext},
)
