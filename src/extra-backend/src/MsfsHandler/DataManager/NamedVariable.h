// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_NAMEDVARIABLE_H
#define FLYBYWIRE_NAMEDVARIABLE_H

#include <string>
#include <SimConnect.h>

#include "CacheableVariable.h"

/**
 * Specialized class for named cacheable variables (LVARS).
 *
 * NamedVariables can't by copy constructed or assigned. They can only be moved.
 * Create a NamedVariable instance instead.
 *
 * @see CacheableVariable
 */
class NamedVariable: public CacheableVariable {

public:

  NamedVariable() = delete; // no default constructor
  NamedVariable(const NamedVariable&) = delete; // no copy constructor
  NamedVariable& operator=(const NamedVariable&) = delete; // no copy assignment

  /**
   * Creates an instance of a named variable.
   * If the variable is not found in the sim it will be created.
   * @param name The name of the variable in the sim. An aircraft prefix (e.g. A32NX_) will be added automatically.
   * @param unit The unit  of the variable as per the sim. See Units.h
   * @param autoReading Used by external classes to determine if the variable should be updated
   * automatically from the sim.
   * @param autoWriting Used by external classes to determine if the variable should be written
   * back to the sim automatically.
   * @param maxAgeTime The maximum age of an auto updated variable in seconds.
   * @param maxAgeTicks The maximum age of an auto updated variable in sim ticks.
   */
  explicit NamedVariable(
    const std::string& name,
    Unit unit = UNITS.Number,
    bool autoReading = false,
    bool autoWriting = false,
    FLOAT64 maxAgeTime = 0.0,
    UINT64 maxAgeTicks = 0);

  FLOAT64 rawReadFromSim() override;
  void rawWriteToSim() override;
};

#endif // FLYBYWIRE_NAMEDVARIABLE_H
