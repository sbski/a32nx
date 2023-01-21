// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>

#include <MSFS/Legacy/gauges.h>

#include "aircraft_prefix.h"
#include "NamedVariable.h"

NamedVariable::NamedVariable(
  const std::string &name,
  Unit unit,
  bool autoReading,
  bool autoWriting,
  FLOAT64 maxAgeTime,
  UINT64 maxAgeTicks)
  : CacheableVariable(std::string(AIRCRAFT_PREFIX) + name, 0, unit, autoReading, autoWriting, maxAgeTime, maxAgeTicks) {

  dataID = register_named_variable(varName.c_str());
}

FLOAT64 NamedVariable::readFromSim() {
  const FLOAT64 value = get_named_variable_value(dataID);
  cachedValue = value;
  dirty = false;
  return value;
}

void NamedVariable::writeToSim() {
  if (cachedValue.has_value()) {
    dirty = false;
    set_named_variable_value(dataID, cachedValue.value());
    return;
  }
  std::cerr << "NamedVariable::setAndWriteToSim() called on \"" << varName
            << "\" but no value is cached"
            << std::endl;
}



