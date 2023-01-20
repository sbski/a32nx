cmake_minimum_required(VERSION 3.19)
project(flybywire-a32nx-flypad-backend)

set(CMAKE_CXX_STANDARD 17)
set(MSFS_SDK "C:\\MSFS SDK")

set(AIRCRAFT "A32NX")
#set(EXAMPLES "-DEXAMPLES")

if (${CMAKE_BUILD_TYPE} MATCHES "Debug")
    set(DEBUG "-DDEBUG")
else ()
    set(DEBUG "-DNDEBUG")
endif ()

# ZERO_LVL 0
# CRITICAL_LVL 1
# ERROR_LVL 2
# WARN_LVL 3
# INFO_LVL 4
# DEBUG_LVL 5
# TRACE_LVL 6
set(LOG_LEVEL 4)

set(CMAKE_CXX_FLAGS "-c -D${AIRCRAFT} ${EXAMPLES} ${DEBUG} -DLOG_LEVEL=${LOG_LEVEL} -std=c++17 -Wall -Wextra --sysroot \"${MSFS_SDK}/WASM/wasi-sysroot\" -target wasm32-unknown-wasi  -D_MSFS_WASM=1 -D__wasi__ -D_LIBCC_NO_EXCEPTIONS -D_LIBCPP_HAS_NO_THREADS -D_WINDLL -D_MBCS -mthread-model single -fno-exceptions -fms-extensions -fvisibility=hidden")
# -Wno-unused-function -Wno-unused-command-line-argument -Wno-ignored-attributes -Wno-macro-redefined

project(Extra-Backend)

add_library(flybywire-a32nx-extra-backend
        src/Gauge_Extra_Backend.cpp
        src/MsfsHandler/MsfsHandler.cpp
        src/MsfsHandler/DataManager/DataManager.cpp
        src/MsfsHandler/DataManager/CacheableVariable.cpp
        src/MsfsHandler/DataManager/NamedVariable.cpp
        src/MsfsHandler/DataManager/AircraftVariable.cpp
        src/MsfsHandler/DataManager/ClientDataAreaVariable.cpp
        src/MsfsHandler/DataManager/EventBase.cpp
        src/MsfsHandler/DataManager/Event.cpp
        src/Modules/Example/ExampleModule.cpp
        src/Modules/LightingPresets/LightingPresets.cpp
        src/Modules/Pushback/Pushback.cpp
        src/Modules/Pushback/InertialDampener.cpp
        src/Modules/AircraftPresets/AircraftPresets.cpp
)

target_include_directories(flybywire-a32nx-extra-backend PUBLIC
        "${MSFS_SDK}/WASM/include"
        "${MSFS_SDK}/WASM/wasi-sysroot/include"
        "${MSFS_SDK}/SimConnect SDK/include "
        src
        src/lib
        src/MsfsHandler
        src/MsfsHandler/DataManager
        src/Modules
        src/Modules/LightingPresets
        src/Modules/Pushback
        src/Modules/AircraftPresets
        )
