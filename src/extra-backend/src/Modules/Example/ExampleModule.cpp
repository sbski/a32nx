// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include "MsfsHandler.h"
#include "ExampleModule.h"

bool ExampleModule::initialize() {
  std::cout << "ExampleModule::initialize()" << std::endl;

  dataManager = &msfsHandler->getDataManager();

  /*
   * Update mode of a variable - last 4 optional parameters of the make_... calls:
   *
   * autoRead: automatically update from sim at every tick when update criteria are met
   * autoWrite: automatically write to sim at every tick
   * maxAgeTime: maximum age of the variable in seconds (influences update reads)
   * maxAgeTicks: maximum age of the variable in ticks (influences update reads)
   *
   * defaults is "false, false, 0, 0"
   */

  // Events
  beaconLightSetEventPtr = dataManager->make_event("BEACON_LIGHTS_SET");

  // LVARS
  debugLVARPtr = dataManager->make_named_var("DEBUG_LVAR", UNITS.Number, true, false, 0, 0);
  //  debugLVARPtr->setEpsilon(0.1); // only read when difference is 0.1 or more

  // Aircraft variables
  beaconLightSwitchPtr = dataManager->make_aircraft_var("LIGHT BEACON", 0, "",
                                        beaconLightSetEventPtr, UNITS.Bool, true, false, 0, 0);

  // Data definition variables
  std::vector<DataDefinitionVariable::DataDefinition> exampleDataDef = {
    {"LIGHT STROBE", 0, UNITS.Bool},
    {"LIGHT WING",   0, UNITS.Bool},
  };
  exampleDataPtr = dataManager->make_datadefinition_var(
    "EXAMPLE DATA", exampleDataDef, &exampleDataStruct, sizeof(exampleDataStruct), true, false, 0, 0);

  isInitialized = true;
  std::cout << "ExampleModule::initialized()" << std::endl;
  return true;
}

bool ExampleModule::preUpdate([[maybe_unused]] sGaugeDrawData* pData) {
  return true;
}

bool ExampleModule::update([[maybe_unused]] sGaugeDrawData* pData) {
  if (!isInitialized) {
    std::cerr << "ExampleModule::update() - not initialized" << std::endl;
    return false;
  }

  if (!msfsHandler->getA32NxIsReady()) return true;

  // Read vars which auto update each tick
  //  std::cout << "debugLVARPtr =  " << debugLVARPtr->get() << " changed? "
  //            << (debugLVARPtr->hasChanged() ? "yes" : "no")
  //            << "debugLVARPtr time = " << msfsHandler->getPreviousSimulationTime()
  //            << " tick = " << msfsHandler->getTickCounter()
  //            << std::endl;
  //
  //  std::cout << "beaconLightSwitchPtr =  " << beaconLightSwitchPtr->get() << " changed? "
  //            << (beaconLightSwitchPtr->hasChanged() ? "yes" : "no")
  //            << "beaconLightSwitchPtr time = " << msfsHandler->getPreviousSimulationTime()
  //            << " tick = " << msfsHandler->getTickCounter()
  //            << std::endl;
  //
  //  std::cout << "strobeLightSwitch =  " << exampleDataStruct.strobeLightSwitch
  //            << " (time = " << msfsHandler->getPreviousSimulationTime()
  //            << " tick = " << msfsHandler->getTickCounter() << ")"
  //            << std::endl;

  // Set a variable which does not auto write
  //  if (msfsHandler->getTickCounter() % 100 == 0) {
  //    debugLVARPtr->setAndWriteToSim(debugLVARPtr->get() + 1);
  //
  //    beaconLightSwitchPtr->setAndWriteToSim(beaconLightSwitchPtr->get() == 0.0 ? 1.0 : 0.0);
  //
  //    exampleDataStruct.strobeLightSwitch = exampleDataStruct.strobeLightSwitch == 0.0 ? 1.0 : 0.0;
  //    exampleDataPtr->writeToSim();
  //  }

  return true;
}

bool ExampleModule::postUpdate([[maybe_unused]] sGaugeDrawData* pData) {
  return true;
}

bool ExampleModule::shutdown() {
  isInitialized = false;
  std::cout << "ExampleModule::shutdown()" << std::endl;
  return true;
}
