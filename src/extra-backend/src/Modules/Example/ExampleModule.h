// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_EXAMPLEMODULE_H
#define FLYBYWIRE_EXAMPLEMODULE_H

#include "Module.h"
#include "DataManager.h"

class MsfsHandler;

/**
 * This is an example module which is used to demonstrate the usage of the module system
 * and to debug the module and DataManager system.
 * It has no effect on the simulation - it should never write to the sim other than in DEBUG mode
 */
class ExampleModule : public Module {
private:
  // Convenience pointer to the data manager
  DataManager* dataManager{};

  // LVARs
  NamedVariablePtr debugLVARPtr{};
  NamedVariablePtr debugLVAR2Ptr{};

  // Sim-vars
  AircraftVariablePtr beaconLightSwitchPtr;
  AircraftVariablePtr beaconLightSwitch2Ptr;
  AircraftVariablePtr beaconLightSwitch3Ptr;
  AircraftVariablePtr fuelPumpSwitch1Ptr;
  AircraftVariablePtr fuelPumpSwitch2Ptr;
  AircraftVariablePtr zuluTimePtr;  // E:ZULU TIME (can't this be requested as aircraft variable?)

  // DataDefinition variables
  DataDefinitionVariablePtr exampleDataPtr;
  struct ExampleData {
    [[maybe_unused]] FLOAT64 strobeLightSwitch;
    [[maybe_unused]] FLOAT64 wingLightSwitch;
    [[maybe_unused]] FLOAT64 zuluTime; // E:ZULU TIME
    [[maybe_unused]] FLOAT64 localTime; // E:LOCAL TIME
    [[maybe_unused]] FLOAT64 absoluteTime; // E:ABSOLUTE TIME
  } exampleDataStruct{};

  // Events
  EventPtr beaconLightSetEventPtr;

public:
  ExampleModule() = delete;

  /**
   * Creates a new ExampleModule instance and takes a reference to the MsfsHandler instance.
   * @param msfsHandler The MsfsHandler instance that is used to communicate with the simulator.
   */
  explicit ExampleModule(MsfsHandler* msfsHandler) : Module(msfsHandler) {};

  bool initialize() override;
  bool preUpdate(sGaugeDrawData* pData) override;
  bool update(sGaugeDrawData* pData) override;
  bool postUpdate(sGaugeDrawData* pData) override;
  bool shutdown() override;

};


#endif //FLYBYWIRE_EXAMPLEMODULE_H
