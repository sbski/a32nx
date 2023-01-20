// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifdef EXAMPLES

#include "logging.h"
#include "ExampleModule.h"
#include "SimObjectBase.h"

bool ExampleModule::initialize() {

  dataManager = &msfsHandler->getDataManager();

  /*
   * Update mode of a variable - last 4 optional parameters of the make_... calls:
   *
   * autoRead: automatically update from sim at every tick when update criteria are met
   * autoWrite: automatically write to sim at every tick
   * maxAgeTime: maximum age of the variable in seconds (influences update reads)
   * maxAgeTicks: maximum age of the variable in ticks (influences update reads)
   *
   * default is "false, false, 0, 0"
   */

  // Events
  beaconLightSetEventPtr = dataManager->make_event("BEACON_LIGHTS_SET");

  // Event with Callback example
  toggleFlightDirectorEventPtr = dataManager->make_event("TOGGLE_FLIGHT_DIRECTOR");
  toggleFlightDirectorEventPtr->subscribeToSim();
  toggleFlightDirectorCallbackID = toggleFlightDirectorEventPtr
    ->addCallback([&](int number, DWORD param0, DWORD param1, DWORD param2, DWORD param3,
                      DWORD param4) {
      LOG_DEBUG("Callback 1: TOGGLE_FLIGHT_DIRECTOR event received with " + std::to_string(number)
                + " params:"
                + " 0: " + std::to_string(param0)
                + " 1: " + std::to_string(param1)
                + " 2: " + std::to_string(param2)
                + " 3: " + std::to_string(param3)
                + " 4: " + std::to_string(param4)
      );
    });

  // Event with Callback example - twice to see multiple callbacks added to a single event
  lightPotentiometerSetEventPtr = dataManager->make_event("LIGHT_POTENTIOMETER_SET");
  lightPotentiometerSetCallbackID = lightPotentiometerSetEventPtr
    ->addCallback([&](int number, DWORD param0, DWORD param1, DWORD param2, DWORD param3,
                      DWORD param4) {
      LOG_DEBUG("Callback 1: LIGHT_POTENTIOMETER_SET event received with " + std::to_string(number)
                + " params:"
                + " 0: " + std::to_string(param0)
                + " 1: " + std::to_string(param1)
                + " 2: " + std::to_string(param2)
                + " 3: " + std::to_string(param3)
                + " 4: " + std::to_string(param4)
      );
    });
  lightPotentiometerSetEventPtr->subscribeToSim();

  lightPotentiometerSetEvent2Ptr = dataManager->make_event("LIGHT_POTENTIOMETER_SET");
  lightPotentiometerSetCallback2ID = lightPotentiometerSetEvent2Ptr
    ->addCallback([&](int number, DWORD param0, DWORD param1, DWORD param2, DWORD param3,
                      DWORD param4) {
      LOG_DEBUG("Callback 2: LIGHT_POTENTIOMETER_SET event received with " + std::to_string(number)
                + " params:"
                + " 0: " + std::to_string(param0)
                + " 1: " + std::to_string(param1)
                + " 2: " + std::to_string(param2)
                + " 3: " + std::to_string(param3)
                + " 4: " + std::to_string(param4)
      );
    });

  // LVARS
  debugLVARPtr = dataManager->make_named_var("DEBUG_LVAR", UNITS.Number, true, false, 0, 0);
  debugLVARPtr->setEpsilon(1.0); // only read when difference is >1.0
  // requested twice to demonstrate de-duplication - also shows optional parameters
  debugLVAR2Ptr = dataManager->make_named_var("DEBUG_LVAR", UNITS.Percent, true);

  // Aircraft variables - requested twice to demonstrate de-duplication
  beaconLightSwitchPtr = dataManager->make_aircraft_var(
    "LIGHT BEACON", 0, "", beaconLightSetEventPtr, UNITS.Bool, false, false, 0, 0);
  // this has autoRead on - this updates the de-duplicated variable to also have autoRead on
  beaconLightSwitch2Ptr = dataManager->make_aircraft_var(
    "LIGHT BEACON", 0, "", beaconLightSetEventPtr, UNITS.Bool, true, true, 0, 0);
  beaconLightSwitch3Ptr = dataManager->make_simple_aircraft_var("LIGHT BEACON", UNITS.Bool);

  // E: variables - don't seem to work as aircraft variables
  zuluTimePtr = dataManager->make_simple_aircraft_var("ZULU TIME", UNITS.Number, true);

  // A:FUELSYSTEM PUMP SWITCH:#ID#  - demonstrates variable with index
  fuelPumpSwitch1Ptr = dataManager->make_aircraft_var("FUELSYSTEM PUMP SWITCH", 1, "",
                                                      beaconLightSetEventPtr, UNITS.Bool, true, false, 0, 0);
  fuelPumpSwitch2Ptr = dataManager->make_aircraft_var("FUELSYSTEM PUMP SWITCH", 2, "",
                                                      beaconLightSetEventPtr, UNITS.Bool, true, false, 0, 0);

  // Data definition variables
  std::vector<SimObjectBase::DataDefinition> exampleDataDef = {
    {"LIGHT STROBE",  0, UNITS.Bool},
    {"LIGHT WING",    0, UNITS.Bool},
    {"ZULU TIME",     0, UNITS.Number},
    {"LOCAL TIME",    0, UNITS.Number},
    {"ABSOLUTE TIME", 0, UNITS.Number},
  };
  exampleDataPtr = dataManager->make_datadefinition_var<ExampleData>(
    "EXAMPLE DATA", exampleDataDef, false, false, 0, 0);

  // Alternative to use autoRead it is possible to set the SIMCONNECT_PERIOD.
  // See https://docs.flightsimulator.com/html/Programming_Tools/SimConnect/API_Reference/Structures_And_Enumerations/SIMCONNECT_CLIENT_DATA_PERIOD.htm?rhhlterm=SIMCONNECT_CLIENT_DATA_PERIOD&rhsearch=SIMCONNECT_CLIENT_DATA_PERIOD
  if (!exampleDataPtr->requestPeriodicDataFromSim(SIMCONNECT_PERIOD_VISUAL_FRAME)) {
    LOG_ERROR("Failed to request periodic data from sim");
  }

  isInitialized = true;
  LOG_INFO("ExampleModule initialized");
  return true;
}

bool ExampleModule::preUpdate([[maybe_unused]] sGaugeDrawData* pData) {
  // empty  could be used to manually update variables if they are not autoRead
  return true;
}

bool ExampleModule::update([[maybe_unused]] sGaugeDrawData* pData) {
  if (!isInitialized) {
    LOG_ERROR("ExampleModule::update() - not initialized");
    return false;
  }

  // Do not do anything if the sim is not running - this is not required but is a good idea
  // It is ready after the click on "READY TO FLY"
  if (!msfsHandler->getA32NxIsReady()) return true;

  // Use this to throttle output frequency while you are debugging
  if (msfsHandler->getTickCounter() % 100 == 0) {

    // testing removing an event callback
    //    if (msfsHandler->getTimeStamp() >= 30 && msfsHandler->getTimeStamp() < 31) {
    //      lightPotentiometerSetEvent2Ptr->removeCallback(lightPotentiometerSetCallback2ID);
    //    }

    // testing doubled LVARs
    //    std::cout << debugLVARPtr->str() << std::endl;
    //    std::cout << debugLVAR2Ptr->str() << std::endl;

    // testing aircraft variables
    //    std::cout << beaconLightSwitchPtr->str() << std::endl;

    // testing data definition variables
    //    std::cout << exampleDataPtr->str() << std::endl;
    //    std::cout << "LIGHT WING " << exampleDataPtr->data().wingLightSwitch << std::endl;
    //    std::cout << "ZULU       " << exampleDataPtr->data().zuluTime << std::endl;
    //    std::cout << "LOCAL      " << exampleDataPtr->data().localTime << std::endl;

    //    // Read vars which auto update each tick
    //    std::cout << "debugLVARPtr =  " << debugLVARPtr->get() << " changed? "
    //              << (debugLVARPtr->hasChanged() ? "yes" : "no")
    //              << " debugLVARPtr  time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "debugLVAR2Ptr = " << debugLVAR2Ptr->get() << " changed? "
    //              << (debugLVAR2Ptr->hasChanged() ? "yes" : "no")
    //              << " debugLVAR2Ptr time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "beaconLightSwitchPtr =  " << beaconLightSwitchPtr->get() << " changed? "
    //              << (beaconLightSwitchPtr->hasChanged() ? "yes" : "no")
    //              << " beaconLightSwitchPtr  time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "beaconLightSwitch2Ptr = " << beaconLightSwitch2Ptr->get() << " changed? "
    //              << (beaconLightSwitch2Ptr->hasChanged() ? "yes" : "no")
    //              << " beaconLightSwitch2Ptr time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "beaconLightSwitch3Ptr = " << beaconLightSwitch3Ptr->get() << " changed? "
    //              << (beaconLightSwitch3Ptr->hasChanged() ? "yes" : "no")
    //              << " beaconLightSwitch3Ptr time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "fuelPumpSwitch1Ptr = " << fuelPumpSwitch1Ptr->get() << " changed? "
    //              << (fuelPumpSwitch2Ptr->hasChanged() ? "yes" : "no")
    //              << " time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "fuelPumpSwitch2Ptr = " << fuelPumpSwitch2Ptr->get() << " changed? "
    //              << (fuelPumpSwitch2Ptr->hasChanged() ? "yes" : "no")
    //              << " time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "zuluTimePtr = " << zuluTimePtr->get() << " changed? "
    //              << (zuluTimePtr->hasChanged() ? "yes" : "no")
    //              << " time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "zuluTime =  " << exampleDataStruct.zuluTime
    //              << " time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "localTime =  " << exampleDataStruct.localTime
    //              << " time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "absoluteTime =  " << static_cast<UINT64>(exampleDataStruct.absoluteTime)
    //              << " time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter()
    //              << std::endl;
    //
    //    std::cout << "strobeLightSwitch =  " << exampleDataStruct.strobeLightSwitch
    //              << " (time = " << msfsHandler->getPreviousSimulationTime()
    //              << " tick = " << msfsHandler->getTickCounter() << ")"
    //              << std::endl;
    //
    //    // Set a variable which does not auto write
    //    debugLVARPtr->setAndWriteToSim(debugLVARPtr->get() + 1);
    //
    // Test writing an aircraft variable by toggling the beacon light switch
    // Immediate write
    //    beaconLightSwitchPtr->setAndWriteToSim(beaconLightSwitchPtr->get() == 0.0 ? 1.0 : 0.0);
    // autoWrite in postUpdate
    //    beaconLightSwitch2Ptr->set(beaconLightSwitch2Ptr->get() == 0.0 ? 1.0 : 0.0);
    //
    // Test writing a data definition variable by toggling the strobe light switch
    //    exampleDataStruct.strobeLightSwitch = exampleDataStruct.strobeLightSwitch == 0.0 ? 1.0 : 0.0;
    //    exampleDataPtr->writeDataToSim();

  } // throttle

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

#endif
