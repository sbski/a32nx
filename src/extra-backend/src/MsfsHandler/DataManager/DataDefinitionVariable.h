// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_DATADEFINITIONVARIABLE_H
#define FLYBYWIRE_DATADEFINITIONVARIABLE_H

#include <vector>
#include <sstream>

#include "IDGenerator.h"
#include "simple_assert.h"
#include "ManagedDataObjectBase.h"
#include "SimObjectBase.h"

/**
 * A class that represents a data definition variable (custom sim object).<br/>
 *
 * Data definition variables are used to define a sim data objects that can be used to retrieve and
 * write data from and to the sim.<br/>
 *
 * For this a memory area needs to be reserved e.g. via a data struct instance. This data struct
 * instance and its size (sizeof) need to be passed to the constructor of this class.
 *
 * Usage in three steps:<br/>
 * 1. a vector of data definitions will be registered with the sim as data definitions (provided in
 *    the constructor)<br/>
 * 2. a data request will be send to the sim to have the sim prepare the requested data<br/>
 * 3. the sim will send an message (SIMCONNECT_RECV_ID_SIMOBJECT_DATA) to signal that the data is
 *    ready to be read. This event also contains a pointer to the provided data. <br/>
 *
 * The DataManager class will provide the requestDataFromSim() method to read the sim's message queue.
 * Currently SIMCONNECT_PERIOD is not used and data is requested on demand via the DataManager.
 */
class DataDefinitionVariable : public SimObjectBase {

private:

  /**
   * List of data definitions to add to the sim object data
   * Used for "SimConnect_AddToDataDefinition"
   */
  std::vector<DataDefinition> dataDefinitions;

  /**
   * Pointer to the data struct that will be used to store the data from the sim.
   */
  void* pDataStruct = nullptr;

  /**
   * Size of the data struct that will be used to store the data from the sim.
   *
   */
  size_t structSize = 0;

public:

  DataDefinitionVariable() = delete; // no default constructor
  DataDefinitionVariable(const DataDefinitionVariable &) = delete; // no copy constructor
  DataDefinitionVariable &operator=(const DataDefinitionVariable &) = delete; // no copy assignment

  ~DataDefinitionVariable() override = default;

  /**
   * Creates a new instance of a DataDefinitionVariable.
   * @param hSimConnect Handle to the SimConnect object.
   * @param name Arbitrary name for the data definition variable for debugging purposes
   * @param dataDefinitions List of data definitions to add to the sim object data
   * @param dataDefinitionId Each data definition variable has its own unique id so the sim can map registered data sim objects to data definitions.
   * @param requestId Each request for sim object data requires a unique id so the sim can provide the request ID in the response (message SIMCONNECT_RECV_ID_SIMOBJECT_DATA).
   * @param pDataStruct Pointer to the data struct that will be used to store the data from the sim.
   * @param structSize Size of the data struct that will be used to store the data from the sim.
   * @param autoReading Used by external classes to determine if the variable should updated from the sim when a sim update call occurs.
   * @param autoWriting Used by external classes to determine if the variable should written to the sim when a sim update call occurs.
   * @param maxAgeTime The maximum age of the value in sim time before it is updated from the sim by the requestUpdateFromSim() method.
   * @param maxAgeTicks The maximum age of the value in ticks before it is updated from the sim by the requestUpdateFromSim() method.
   */
  DataDefinitionVariable(
    HANDLE hSimConnect,
    const std::string &varName,
    const std::vector<DataDefinition> &dataDefinitions,
    DWORD dataDefId,
    DWORD requestId,
    void* pDataStruct, // TODO: use template
    size_t structSize,
    bool autoRead,
    bool autoWrite,
    FLOAT64 maxAgeTime,
    UINT64 maxAgeTicks
    )
    : SimObjectBase(varName, autoRead, autoWrite, maxAgeTime, maxAgeTicks, dataDefId, hSimConnect, requestId),
      dataDefinitions(dataDefinitions), pDataStruct(pDataStruct), structSize(structSize) {

  // TODO: what happens if definition is wrong - will this cause a sim crash?
    //  Might need to move this out of the constructor and into a separate method

    SIMPLE_ASSERT(structSize == dataDefinitions.size() * sizeof(FLOAT64),
                  "DataDefinitionVariable::receiveDataFromSimCallback: Struct size mismatch")

    for (auto &ddef: dataDefinitions) {
      std::string fullVarName = ddef.name;
      if (ddef.index != 0) {
        fullVarName += ":" + std::to_string(ddef.index);
      }

      if (!SUCCEEDED(SimConnect_AddToDataDefinition(
        hSimConnect,
        dataDefId,
        fullVarName.c_str(),
        ddef.unit.name,
        SIMCONNECT_DATATYPE_FLOAT64))) {

        std::cerr << "Failed to add " << ddef.name << " to data definition." << std::endl;
      }
    }
  }

  [[nodiscard]] bool requestDataFromSim() const override;
  [[nodiscard]] bool requestUpdateFromSim(FLOAT64 timeStamp, UINT64 tickCounter) override;
  void receiveDataFromSimCallback(const SIMCONNECT_RECV_SIMOBJECT_DATA* pData) override;
  bool writeDataToSim() override;
  bool updateDataToSim(FLOAT64 timeStamp, UINT64 tickCounter) override;

  // Getters and setters

  [[nodiscard]]
  const std::string &getName() const { return name; }

  [[maybe_unused]] [[nodiscard]]
  const std::vector<DataDefinition> &getDataDefinitions() const { return dataDefinitions; }

  [[maybe_unused]] [[nodiscard]]
  void* getPDataStruct() const { return pDataStruct; }

  [[nodiscard]]
  std::string str() const {
    std::stringstream os;
    os << "DataDefinition{ name='" << getName() << "'";
    os << " definitions=" << dataDefinitions.size();
    os << " ptrStruct=" << pDataStruct;
    os << " structSize=" << structSize;
    os << " autoRead=" << (isAutoRead() ? "autoR" : "manualR");
    os << " autoWrite=" << (isAutoWrite() ? "autoW" : "manualW");
    os << " maxAgeTime=" << getMaxAgeTime() << "ms";
    os << " maxAgesTicks=" << getMaxAgeTicks() << "ticks";
    os << " }";
    return os.str();
  }
};

/**
 * Overloaded operator to write the value of a CacheableVariable to an ostream
 * @param os
 * @param variable
 * @return the ostream
 */
inline std::ostream &operator<<(std::ostream &os, const DataDefinitionVariable &variable) {
  os << variable.str();
  return os;
}

#endif //FLYBYWIRE_DATADEFINITIONVARIABLE_H
