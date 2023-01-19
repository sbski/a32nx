// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>

#include <MSFS/Legacy/gauges.h>

#include "NamedVariable.h"
#include "logging.h"

FLOAT64 NamedVariable::rawReadFromSim() {
  const FLOAT64 d = get_named_variable_value(dataID);
  LOG_TRACE("NamedVariable::rawReadFromSim() "
            + this->name
            + " fromSim = " + d
            + " cached  = " + cachedValue.value_or(-999999)
            + std::endl);
  return d;
}

void NamedVariable::rawWriteToSim() {
  set_named_variable_value(dataID, cachedValue.value());
}

std::string NamedVariable::str() const {
  std::stringstream ss;
  ss << "NamedVariable: [" << name;
  ss << ", value: " << (cachedValue.has_value() ? std::to_string(cachedValue.value()) : "N/A");
  ss << ", unit: " << unit.name;
  ss << ", changed: " << changed;
  ss << ", dirty: " << dirty;
  ss << ", timeStamp: " << timeStampSimTime;
  ss << ", tickStamp: " << tickStamp;
  ss << ", autoRead: " << autoRead;
  ss << ", autoWrite: " << autoWrite;
  ss << ", maxAgeTime: " << maxAgeTime;
  ss << ", maxAgeTicks: " << maxAgeTicks;
  ss << "]";
  return ss.str();
}



