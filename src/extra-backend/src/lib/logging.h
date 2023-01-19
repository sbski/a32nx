// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_LOGGING_H
#define FLYBYWIRE_LOGGING_H

#include <iostream>

/**
 * Simple logging facility for the FlyByWire Simulations C++ WASM framework.
 * No performance when turned off and only the minimum overhead when turned on to a specific level.
 *
 * Use in the following way:
 *
 * LOG_INFO("PANEL_SERVICE_PRE_INSTALL");
 * LOG_INFO("PANEL_SERVICE_PRE_INSTALL: " + panelService->getPanelServiceName());
 *
 * This will be improved and extended in the future.
 */

#define ZERO_LVL 0
#define CRITICAL_LVL 1
#define ERROR_LVL 2
#define WARN_LVL 3
#define INFO_LVL 4
#define DEBUG_LVL 5
// TRACE_LVL 6

#if LOG_LEVEL > ZERO_LVL
#define LOG_CRITICAL(msg) logger->critical(msg)
#define LOG_CRITICAL_START while (1) {
#define LOG_CRITICAL_END break;}
#else
#define LOG_CRITICAL(msg) void(0)
#define LOG_CRITICAL_START while (0) {
#define LOG_CRITICAL_END }
#endif


#if LOG_LEVEL > CRITICAL_LVL
#define LOG_ERROR(msg) logger->error(msg)
#define LOG_ERROR_START while (1) {
#define LOG_ERROR_END break;}
#else
#define LOG_ERROR(msg) void(0)
#define LOG_ERROR_START while (0) {
#define LOG_ERROR_END }
#endif

#if LOG_LEVEL > ERROR_LVL
#define LOG_WARN(msg) logger->warn(msg)
#define LOG_WARN_START while (1) {
#define LOG_WARN_END break;}
#else
#define LOG_WARN(msg) void(0)
#define LOG_WARN_START while (0) {
#define LOG_WARN_END }
#endif

#if LOG_LEVEL > WARN_LVL
#define LOG_INFO(msg) logger->info(msg)
#define LOG_INFO_START while (1) {
#define LOG_INFO_END break;}
#else
#define LOG_INFO(msg) void(0)
#define LOG_INFO_START while (0) {
#define LOG_INFO_END }
#endif

#if LOG_LEVEL > INFO_LVL
#define LOG_DEBUG(msg) logger->debug(msg)
#define LOG_DEBUG_START while (1) {
#define LOG_DEBUG_END break;}
#else
#define LOG_DEBUG(msg) void(0)
#endif

#if LOG_LEVEL > DEBUG_LVL
#define LOG_TRACE(msg) logger->trace(msg)
#define LOG_TRACE_START while (1) {
#define LOG_TRACE_END break;}
#else
#define LOG_TRACE(msg) void(0)
#define LOG_TRACE_START while (0) {
#define LOG_TRACE_END }
#endif

/**
 * Singleton class for Logger
 */
class Logger {
public:
  Logger() = default;
  /** get the singleton instance of Logger */
  static Logger* instance() {
    static Logger instance;
    return &instance;
  }
public:
  // disallow copies
  Logger(Logger const &) = delete;            // copy
  Logger &operator=(const Logger &) = delete; // copy assignment
  Logger(Logger const &&) = delete; // move
  Logger &operator=(const Logger &&) = delete;// move assignment

  void critical(const std::string& msg) { std::cerr << "critical: " << msg << std::endl; }
  void error(const std::string& msg) { std::cerr << "error: " << msg << std::endl; }
  void warn(const std::string& msg) { std::cerr << "warn: " << msg << std::endl; }
  void info(const std::string& msg) { std::cout << "info: " << msg << std::endl; }
  void debug(const std::string& msg) { std::cout << "debug: " << msg << std::endl; }
  void trace(const std::string& msg) { std::cout << "trace: " << msg << std::endl; }
};

inline Logger* logger = Logger::instance();

#endif//FLYBYWIRE_LOGGING_H
