#pragma once

extern "C" {

typedef long long sqlite3_int64;
typedef struct sqlite3 sqlite3;
typedef struct sqlite3_stmt sqlite3_stmt;
typedef void (*sqlite3_destructor_type)(void*);

int sqlite3_open(const char* filename, sqlite3** ppDb);
int sqlite3_close(sqlite3* db);
int sqlite3_exec(
    sqlite3* db,
    const char* sql,
    int (*callback)(void*, int, char**, char**),
    void* arg,
    char** errmsg);
int sqlite3_prepare_v2(
    sqlite3* db,
    const char* zSql,
    int nByte,
    sqlite3_stmt** ppStmt,
    const char** pzTail);
int sqlite3_bind_blob(
    sqlite3_stmt* stmt,
    int index,
    const void* value,
    int n,
    sqlite3_destructor_type destructor);
int sqlite3_bind_text(
    sqlite3_stmt* stmt,
    int index,
    const char* value,
    int n,
    sqlite3_destructor_type destructor);
int sqlite3_bind_int64(sqlite3_stmt* stmt, int index, sqlite3_int64 value);
int sqlite3_step(sqlite3_stmt* stmt);
int sqlite3_finalize(sqlite3_stmt* stmt);
void sqlite3_free(void* ptr);

}  // extern "C"

constexpr int SQLITE_OK = 0;
constexpr int SQLITE_DONE = 101;
constexpr int SQLITE_CONSTRAINT = 19;
#define SQLITE_TRANSIENT ((sqlite3_destructor_type)-1)
