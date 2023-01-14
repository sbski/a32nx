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

FLOAT64 NamedVariable::rawReadFromSim() {
  const FLOAT64 d = get_named_variable_value(dataID);
  //  std::cout << "NamedVariable::rawReadFromSim() "
  //            << varName
  //            << " fromSim = "  << d
  //            << " cached  = "  << cachedValue.value_or(-999999)
  //            << std::endl;
  return d;
}

void NamedVariable::rawWriteToSim() {
  set_named_variable_value(dataID, cachedValue.value());
}



