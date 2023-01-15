// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#include <iostream>

#include "CacheableVariable.h"
#include "math_utils.h"

FLOAT64 CacheableVariable::get() const {
  if (cachedValue.has_value()) {
    if (dirty) {
      std::cerr << "CacheableVariable::requestUpdateFromSim() called on " << varName
                << " but the value is dirty" << std::endl;
    }
    return cachedValue.value();
  }
  std::cerr << "CacheableVariable::get() called on " << varName << " but no value is cached"
            << std::endl;
  return FLOAT64{};
}

FLOAT64 CacheableVariable::updateFromSim(FLOAT64 timeStamp, UINT64 tickCounter) {
  if (!cachedValue.has_value()) {
    return readFromSim();
  }
  // only update if the value is equal or older than the max age for sim time or ticks
  if (timeStampSimTime + maxAgeTime >= timeStamp || tickStamp + maxAgeTicks >= tickCounter) {
    changed = false;
    // DEBUG
    //    std::cout << "CacheableVariable::updateFromSim() - " << varName << " is up to date"
    //              << " timeStampSimTime = " << timeStampSimTime
    //              << " maxAgeTime = " << maxAgeTime
    //              << " timeStamp = " << timeStamp
    //              << " tickStamp = " << tickStamp
    //              << " maxAgeTicks = " << maxAgeTicks
    //              << " tickCounter = " << tickCounter
    //              << std::endl;
    return cachedValue.value();
  }
  // DEBUG
  //  std::cout << "CacheableVariable::updateFromSim() - " << varName << " is out of date" << std::endl;
  // update the value from the sim
  const FLOAT64 simValue = readFromSim();
  timeStampSimTime = timeStamp;
  tickStamp = tickCounter;
  return simValue;
}

FLOAT64 CacheableVariable::readFromSim() {
  const FLOAT64 fromSim = rawReadFromSim();
  changed = !cachedValue.has_value()
            || !helper::Math::almostEqual(fromSim, cachedValue.value(), epsilon);

  // Handling of "changed" - two options
  // 1. new field to remember the last value marked as changed and compare it to the new value
  // 2. do not update the cache value and discard the sim read (which is a bit of waste)
  // Option 2 has been chosen for now as it is simpler and doesn't need the extra field.
  if (changed) {
    cachedValue = fromSim;
    /* DEBUG
    //  if (changed) {
    //    std::cout << "CacheableVariable::readFromSim() - "
    //              << varName
    //              << " changed from " << cachedValue.value_or(-999999)
    //              << " to " << fromSim
    //              << std::endl;
    //  }
     */
  }
  /*  else {
  // DEBUG
  //    std::cout << "CacheableVariable::readFromSim() - " << varName << " is unchanged" << std::endl;
  //  }
  */

  dirty = false;
  return cachedValue.value();
}

void CacheableVariable::set(FLOAT64 value) {
/*  // DEBUG
  //  std::cout << "CacheableVariable::set() - "
  //            << varName
  //            << " from " << cachedValue.value_or(-999999)
  //            << " to " << value
  //            << std::endl;*/
  if (cachedValue.has_value() && cachedValue.value() == value) {
    return;
  }
  cachedValue = value;
  dirty = true;
}

void CacheableVariable::updateToSim() {
  if (cachedValue.has_value() && dirty) {
    writeToSim();
  }
}

void CacheableVariable::setAndWriteToSim(FLOAT64 value) {
  set(value);
  writeToSim();
}


void CacheableVariable::writeToSim() {
  if (cachedValue.has_value()) {
    changed = false;
    dirty = false;
    // TODO: should we check for almostEqual() here?
    rawWriteToSim();
    return;
  }
  std::cerr << "CacheableVariable::writeToSim() called on \"" << varName
            << "\" but no value is cached"
            << std::endl;
}

