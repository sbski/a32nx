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



