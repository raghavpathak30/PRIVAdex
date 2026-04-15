#include <iostream>
#include <csignal>
#include <memory>

#include "matching_server.h"

namespace {

std::unique_ptr<grpc::Server>* g_server_ptr = nullptr;

void handle_signal(int) {
    if (g_server_ptr && g_server_ptr->get()) {
        (*g_server_ptr)->Shutdown();
    }
}

}  // namespace

int main(int argc, char** argv) {
    std::string address = "0.0.0.0:50053";
    if (argc > 1) {
        address = argv[1];
    }

    auto server = BuildMatchingServer(address);
    if (!server) {
        std::cerr << "[matching_server] failed to start on " << address << "\n";
        return 1;
    }

    g_server_ptr = &server;
    std::signal(SIGINT, handle_signal);
    std::signal(SIGTERM, handle_signal);

    std::cout << "[matching_server] listening on " << address << "\n";
    server->Wait();
    return 0;
}
