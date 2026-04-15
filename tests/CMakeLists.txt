include(FetchContent)

FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.7.1
)
FetchContent_MakeAvailable(Catch2)

add_executable(test_darkpool test_darkpool.cpp)
target_link_libraries(test_darkpool PRIVATE darkpool_he_core Catch2::Catch2WithMain)
target_include_directories(test_darkpool PRIVATE ${CMAKE_SOURCE_DIR}/he_core/include)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(test_darkpool PRIVATE -mavx2)
endif()

if(OpenMP_CXX_FOUND)
    target_link_libraries(test_darkpool PRIVATE OpenMP::OpenMP_CXX)
endif()

include(${Catch2_SOURCE_DIR}/extras/Catch.cmake)
catch_discover_tests(test_darkpool)
