// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef __INTELLISENSE__
#define MODULE_EXPORT __attribute__((visibility("default")))
#define MODULE_WASM_MODNAME(mod) __attribute__((import_module(mod)))
#else
#define MODULE_EXPORT
#define MODULE_WASM_MODNAME(mod)
#define __attribute__(x)
#define __restrict__
#endif

#include <MSFS/Legacy/gauges.h>
#include <MSFS/MSFS.h>
#include <MSFS/MSFS_Render.h>

#include "MsfsHandler/MsfsHandler.h"
#include "LightingPresets/LightingPresets.h"
#include "Pushback.h"

MsfsHandler msfsHandler("Gauge_Extra_Backend");
[[maybe_unused]]
LightingPresets lightingPresets(&msfsHandler);
[[maybe_unused]]
Pushback pushback(&msfsHandler);
/**
 * Gauge Callback
 * There can by multiple gauges in a single wasm module. Just add another gauge callback function and register it in the
 * panel.cfg file.
 * Try no to put any logic in the gauge callback function. Instead, create a new class and put the logic there.
 * @see
 * https://docs.flightsimulator.com/html/Content_Configuration/SimObjects/Aircraft_SimO/Instruments/C_C++_Gauges.htm?rhhlterm=_gauge_callback&rhsearch=_gauge_callback
 */
__attribute__((export_name("Gauge_Extra_Backend_gauge_callback"))) extern "C" __attribute__((unused)) bool
Gauge_Extra_Backend(__attribute__((unused)) FsContext ctx, int service_id, void* pData) {
  switch (service_id) {
    case PANEL_SERVICE_PRE_INSTALL: {
      //    std::cout << "PANEL_SERVICE_PRE_INSTALL" << std::endl;
      return msfsHandler.initialize();
    }
      //  case PANEL_SERVICE_POST_INSTALL: {
      //    //    std::cout << "PANEL_SERVICE_POST_INSTALL" << std::endl;
      //    return true;
      //  }
      //  case PANEL_SERVICE_PRE_INITIALIZE: {
      //    //    std::cout << "PANEL_SERVICE_PRE_INITIALIZE" << std::endl;
      //    return true;
      //  }
      //  case PANEL_SERVICE_POST_INITIALIZE: {
      //    //    std::cout << "PANEL_SERVICE_POST_INITIALIZE" << std::endl;
      //    return true;
      //  }
      //  case PANEL_SERVICE_PRE_UPDATE: {
      //    //    std::cout << "PANEL_SERVICE_PRE_UPDATE" << std::endl;
      //    return true;
      //  }
      //  case PANEL_SERVICE_POST_UPDATE: {
      //    //    std::cout << "PANEL_SERVICE_POST_UPDATE" << std::endl;
      //    return true;
      //  }
    case PANEL_SERVICE_PRE_DRAW: {
      //    std::cout << "PANEL_SERVICE_PRE_DRAW" << std::endl;
      auto drawData = static_cast<sGaugeDrawData*>(pData);
      return msfsHandler.update(drawData);
    }
      // case PANEL_SERVICE_POST_DRAW: {
      //   //    std::cout << "PANEL_SERVICE_POST_DRAW" << std::endl;
      //   return true;
      // }
    case PANEL_SERVICE_PRE_KILL: {
      // std::cout << "PANEL_SERVICE_PRE_KILL" << std::endl;
      return msfsHandler.shutdown();
    }
      // case PANEL_SERVICE_POST_KILL: {
      //   //    std::cout << "PANEL_SERVICE_POST_KILL" << std::endl;
      //   return true;
      // }
    default:
      break;
  }
  return false;
}
