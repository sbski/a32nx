// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_A32NX_DATAOBJECTBASE_H
#define FLYBYWIRE_A32NX_DATAOBJECTBASE_H

#include "lib/Units.h"
#include <MSFS/Legacy/gauges.h>
#include <utility>
#include <string>
#include <sstream>
#include <optional>

class DataObjectBase {

protected:
  /**
   * The name of the variable in the sim
   */
  const std::string name;

public:

  DataObjectBase() = delete; // no default constructor
  DataObjectBase(const DataObjectBase&) = delete; // no copy constructor
  DataObjectBase& operator=(const DataObjectBase&) = delete; // no copy assignment

  virtual ~DataObjectBase() = default;

  explicit DataObjectBase(std::string varName) : name(std::move(varName)) {}

  /**
   * @return the name of the variable
   */
  [[nodiscard]]
  const std::string &getVarName() const { return name; }
};

#endif //FLYBYWIRE_A32NX_DATAOBJECTBASE_H
