add_executable(engine_bench engine_bench.cpp)

target_include_directories(engine_bench
    PRIVATE
        ${CMAKE_SOURCE_DIR}/matching_server/include
        ${CMAKE_SOURCE_DIR}/he_core/include
        ${GENERATED_PROTO_DIR}
)

target_link_libraries(engine_bench
    PRIVATE
        darkpool_server_core
)

add_custom_target(benchmark
    COMMAND engine_bench --iterations 100 --json engine_bench_summary.json
    WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
    DEPENDS engine_bench
)

add_test(
    NAME benchmark_gate
    COMMAND engine_bench --iterations 100 --json engine_bench_summary.json
)
set_tests_properties(benchmark_gate PROPERTIES WORKING_DIRECTORY ${CMAKE_BINARY_DIR})
