cmake_minimum_required(VERSION 3.20)
project(PrivaDEXDarkPool VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

enable_testing()

find_package(SEAL 4.1 REQUIRED)
find_package(OpenMP)
find_package(Protobuf REQUIRED)
find_package(gRPC REQUIRED)
find_package(Python3 REQUIRED COMPONENTS Interpreter Development)
if(EXISTS "/lib/x86_64-linux-gnu/libsqlite3.so.0")
    set(SQLITE3_LIBRARY "/lib/x86_64-linux-gnu/libsqlite3.so.0")
elseif(EXISTS "/usr/lib/x86_64-linux-gnu/libsqlite3.so.0")
    set(SQLITE3_LIBRARY "/usr/lib/x86_64-linux-gnu/libsqlite3.so.0")
else()
    message(FATAL_ERROR "Could not locate libsqlite3.so.0")
endif()

execute_process(
    COMMAND ${Python3_EXECUTABLE} -c "import pybind11; print(pybind11.get_include())"
    OUTPUT_VARIABLE PYBIND11_INCLUDE_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

add_library(darkpool_he_core
    he_core/src/ckks_context_dp.cpp
    he_core/src/bfv_context_dp.cpp
    he_core/src/order_encoder.cpp
    he_core/src/sign_poly_eval.cpp
    he_core/src/bfv_equality_eval.cpp
    he_core/src/slot_blinding.cpp
    he_core/src/hoisted_tree_sum_dp.cpp
)

target_include_directories(darkpool_he_core
    PUBLIC
        ${CMAKE_SOURCE_DIR}/he_core/include
)

if(TARGET SEAL::seal)
    target_link_libraries(darkpool_he_core PUBLIC SEAL::seal)
elseif(TARGET seal)
    target_link_libraries(darkpool_he_core PUBLIC seal)
else()
    message(FATAL_ERROR "Could not find a SEAL library target (expected SEAL::seal or seal)")
endif()

if(OpenMP_CXX_FOUND)
    target_link_libraries(darkpool_he_core PUBLIC OpenMP::OpenMP_CXX)
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(darkpool_he_core PUBLIC -mavx2)
endif()

add_executable(smoke_test tests/smoke_test.cpp)
if(TARGET SEAL::seal)
    target_link_libraries(smoke_test PRIVATE SEAL::seal)
elseif(TARGET seal)
    target_link_libraries(smoke_test PRIVATE seal)
endif()
if(OpenMP_CXX_FOUND)
    target_link_libraries(smoke_test PRIVATE OpenMP::OpenMP_CXX)
endif()
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(smoke_test PRIVATE -mavx2)
endif()

add_test(NAME smoke_test COMMAND smoke_test)

set(DARKPOOL_PROTO ${CMAKE_SOURCE_DIR}/proto/darkpool.proto)
set(GENERATED_PROTO_DIR ${CMAKE_BINARY_DIR}/generated)
set(GENERATED_GRPC_DIR ${CMAKE_BINARY_DIR}/generated)

add_custom_command(
    OUTPUT
        ${GENERATED_PROTO_DIR}/darkpool.pb.h
        ${GENERATED_PROTO_DIR}/darkpool.pb.cc
        ${GENERATED_GRPC_DIR}/darkpool.grpc.pb.h
        ${GENERATED_GRPC_DIR}/darkpool.grpc.pb.cc
    COMMAND ${CMAKE_COMMAND} -E make_directory ${GENERATED_PROTO_DIR}
    COMMAND ${Protobuf_PROTOC_EXECUTABLE}
            --proto_path=${CMAKE_SOURCE_DIR}/proto
            --cpp_out=${GENERATED_PROTO_DIR}
            --grpc_out=${GENERATED_GRPC_DIR}
            --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
            ${DARKPOOL_PROTO}
    DEPENDS ${DARKPOOL_PROTO}
    COMMENT "Generating protobuf sources into build/generated"
)

add_custom_target(darkpool_proto_gen ALL
    DEPENDS
        ${GENERATED_PROTO_DIR}/darkpool.pb.h
        ${GENERATED_PROTO_DIR}/darkpool.pb.cc
        ${GENERATED_GRPC_DIR}/darkpool.grpc.pb.h
        ${GENERATED_GRPC_DIR}/darkpool.grpc.pb.cc
)

add_library(darkpool_proto
    ${GENERATED_PROTO_DIR}/darkpool.pb.cc
    ${GENERATED_GRPC_DIR}/darkpool.grpc.pb.cc
)
add_dependencies(darkpool_proto darkpool_proto_gen)
target_include_directories(darkpool_proto
    PUBLIC
        ${GENERATED_PROTO_DIR}
)
target_link_libraries(darkpool_proto
    PUBLIC
        protobuf::libprotobuf
        gRPC::grpc++
)

add_library(darkpool_server_core
    matching_server/src/seal_serialization.cpp
    matching_server/src/matching_server.cpp
)
target_include_directories(darkpool_server_core
    PUBLIC
        ${CMAKE_SOURCE_DIR}/matching_server/include
        ${CMAKE_SOURCE_DIR}/he_core/include
        ${GENERATED_PROTO_DIR}
        ${PYBIND11_INCLUDE_DIR}
)
target_link_libraries(darkpool_server_core
    PUBLIC
        darkpool_he_core
        darkpool_proto
    Python3::Python
    ${SQLITE3_LIBRARY}
)

add_executable(matching_server matching_server/src/server_main.cpp)
target_include_directories(matching_server
    PRIVATE
        ${CMAKE_SOURCE_DIR}/matching_server/include
        ${CMAKE_SOURCE_DIR}/he_core/include
        ${GENERATED_PROTO_DIR}
)
target_link_libraries(matching_server
    PRIVATE
        darkpool_server_core
)

add_executable(matching_server_test matching_server/src/matching_server_test.cpp)
target_include_directories(matching_server_test
    PRIVATE
        ${CMAKE_SOURCE_DIR}/matching_server/include
        ${CMAKE_SOURCE_DIR}/he_core/include
        ${GENERATED_PROTO_DIR}
)
target_link_libraries(matching_server_test
    PRIVATE
        darkpool_server_core
)

add_test(NAME matching_server_integration COMMAND matching_server_test)
add_test(NAME submit_order_pytest COMMAND ${Python3_EXECUTABLE} -m pytest -q ${CMAKE_SOURCE_DIR}/trader_client/test_submit_order.py)
set_tests_properties(submit_order_pytest PROPERTIES WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})
add_test(NAME settle_bridge_pytest COMMAND ${Python3_EXECUTABLE} -m pytest -q ${CMAKE_SOURCE_DIR}/trader_client/test_settle_bridge.py)
set_tests_properties(settle_bridge_pytest PROPERTIES WORKING_DIRECTORY ${CMAKE_SOURCE_DIR})

add_subdirectory(benchmarks)
add_subdirectory(tests)
