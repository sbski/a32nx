// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_DATADEFINITIONVARIABLE_H
#define FLYBYWIRE_DATADEFINITIONVARIABLE_H

#include <vector>
#include <sstream>
#include <memory>

#include <MSFS/Legacy/gauges.h>
#include <SimConnect.h>

#include "IDGenerator.h"
#include "simple_assert.h"
#include "ManagedDataObjectBase.h"
#include "SimObjectBase.h"

#define quote(x) #x

/**
 * A class that represents a data definition variable (custom sim object).<br/>
 *
 * Data definition variables are used to define a sim data objects that can be used to retrieve and
 * write data from and to the sim.<br/>
 *
 * For this a memory area needs to be reserved e.g. via a data struct instance. This data struct
 * needs to be passed a template parameter to this class.
 *
 * Usage in three steps:<br/>
 * 1. a vector of data definitions will be registered with the sim as data definitions (provided in
 *    the constructor)<br/>
 * 2. a data request will be send to the sim to have the sim prepare the requested data<br/>
 * 3. the sim will send an message (SIMCONNECT_RECV_ID_SIMOBJECT_DATA) to signal that the data is
 *    ready to be read. This event also contains a pointer to the provided data. <br/>
 *
 * The DataManager class will provide the requestDataFromSim() method to read the sim's message queue.
 * Currently SIMCONNECT_PERIOD is not used (at the mometen) and data is requested on demand via
 * the DataManager.
 */
template<typename T>
class DataDefinitionVariable : public SimObjectBase {

private:

  /**
   * List of data definitions to add to the sim object data
   * Used for "SimConnect_AddToDataDefinition"
   */
  std::vector<DataDefinition> dataDefinitions;

  /**
   * The data struct that will be used to store the data from the sim.
   */
  T dataStruct{};

public:

  DataDefinitionVariable<T>() = delete; // no default constructor
  DataDefinitionVariable<T>(const DataDefinitionVariable &) = delete; // no copy constructor
  DataDefinitionVariable<T> &
  operator=(const DataDefinitionVariable &) = delete; // no copy assignment

  ~DataDefinitionVariable<T>() override = default;

  /**
   * Creates a new instance of a DataDefinitionVariable.
   * @typename T: the data struct type that will be used to store the data from the sim.
   * @param hSimConnect Handle to the SimConnect object.
   * @param name Arbitrary name for the data definition variable for debugging purposes
   * @param dataDefinitions List of data definitions to add to the sim object data
   * @param dataDefinitionId Each data definition variable has its own unique id so the sim can map registered data sim objects to data definitions.
   * @param requestId Each request for sim object data requires a unique id so the sim can provide the request ID in the response (message SIMCONNECT_RECV_ID_SIMOBJECT_DATA).
   * @param autoReading Used by external classes to determine if the variable should updated from the sim when a sim update call occurs.
   * @param autoWriting Used by external classes to determine if the variable should written to the sim when a sim update call occurs.
   * @param maxAgeTime The maximum age of the value in sim time before it is updated from the sim by the requestUpdateFromSim() method.
   * @param maxAgeTicks The maximum age of the value in ticks before it is updated from the sim by the requestUpdateFromSim() method.
   */
  DataDefinitionVariable<T>(
    HANDLE hSimConnect,
    const std::string &varName,
    const std::vector<DataDefinition> &dataDefinitions,
    DWORD dataDefId,
    DWORD requestId,
    bool autoRead,
    bool autoWrite,
    FLOAT64 maxAgeTime,
    UINT64 maxAgeTicks
  )
    : SimObjectBase(varName, autoRead, autoWrite, maxAgeTime, maxAgeTicks, dataDefId, hSimConnect, requestId),
      dataDefinitions(dataDefinitions), dataStruct{} {

    // TODO: what happens if definition is wrong - will this cause a sim crash?
    //  Might need to move this out of the constructor and into a separate method

    SIMPLE_ASSERT(sizeof(T) == dataDefinitions.size() * sizeof(FLOAT64),
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

  [[nodiscard]] bool requestDataFromSim() const override {
    if (!SUCCEEDED(SimConnect_RequestDataOnSimObject(
      hSimConnect,
      requestId,
      dataDefId,
      SIMCONNECT_OBJECT_ID_USER,
      SIMCONNECT_PERIOD_ONCE))) { // TODO - evtl. support using SIMCONNECT_PERIOD

      std::cerr << "Failed to request data from sim." << std::endl;
      return false;
    }
    return true;
  };

  [[nodiscard]] bool requestUpdateFromSim(FLOAT64 timeStamp, UINT64 tickCounter) override {
    // only update if the value is equal or older than the max age for sim time ot ticks
    if (timeStampSimTime + maxAgeTime >= timeStamp || tickStamp + maxAgeTicks >= tickCounter) {
      return true;
    }
    timeStampSimTime = timeStamp;
    tickStamp = tickCounter;

    if (!SUCCEEDED(SimConnect_RequestDataOnSimObject(
      hSimConnect,
      requestId,
      dataDefId,
      SIMCONNECT_OBJECT_ID_USER,
      SIMCONNECT_PERIOD_ONCE))) { // TODO: evtl. support SIMCONNECT_PERIOD

      std::cerr << "Failed to request data from sim." << std::endl;
      std::cerr << "Failed to request data from sim." << std::endl;
      return false;
    }
    return true;
  };

  void receiveDataFromSimCallback(const SIMCONNECT_RECV_SIMOBJECT_DATA* pData) override {
    SIMPLE_ASSERT(sizeof(T) == pData->dwDefineCount * sizeof(FLOAT64),
                  "DataDefinitionVariable::receiveDataFromSimCallback: Struct size mismatch")
    SIMPLE_ASSERT(pData->dwRequestID == requestId,
                  "DataDefinitionVariable::receiveDataFromSimCallback: Request ID mismatch")

    std::memcpy(&dataStruct, &pData->dwData, sizeof(T));
  };

  bool writeDataToSim() override {
    const bool result = SUCCEEDED(
      SimConnect_SetDataOnSimObject(
        hSimConnect,
        dataDefId,
        SIMCONNECT_OBJECT_ID_USER,
        0,
        0,
        sizeof(T),
        &dataStruct));

    if (!result) {
      std::cerr << "Setting data to sim for " << name << " with dataDefId=" << dataDefId
                << " failed!"
                << std::endl;
    }
    return result;
  };

  bool updateDataToSim(FLOAT64 timeStamp, UINT64 tickCounter) override {
    if (writeDataToSim()) {
      timeStampSimTime = timeStamp;
      tickStamp = tickCounter;
      return true;
    }
    return false;
  };

  // Getters and setters

  [[nodiscard]]
  const std::string &getName() const { return name; }

  [[maybe_unused]] [[nodiscard]]
  const std::vector<DataDefinition> &getDataDefinitions() const { return dataDefinitions; }

  /**
   * Returns a modifiable reference to the data container
   * @return T& Reference to the data container
   */
  [[maybe_unused]] [[nodiscard]]
  T &data() { return dataStruct; }

  /**
   * Returns a constant reference to the data container
   * @return std::vector<T>& Reference to the data container
   */
  [[maybe_unused]] [[nodiscard]]
  const T &data() const { return dataStruct; }

  [[nodiscard]]
  std::string str() const override {
    std::stringstream ss;
    ss << "DataDefinition[ name=" << getName();
    ss << " definitions=" << dataDefinitions.size();
    ss << ", structSize=" << sizeof(T);
    ss << ", timeStamp: " << timeStampSimTime;
    ss << ", tickStamp: " << tickStamp;
    ss << ", autoRead: " << autoRead;
    ss << ", autoWrite: " << autoWrite;
    ss << ", maxAgeTime: " << maxAgeTime;
    ss << ", maxAgeTicks: " << maxAgeTicks;
    ss << ", dataType=" << typeid(dataStruct).name() << "::" << quote(dataStruct);
    ss << "]";
    return ss.str();
  }
};

#endif //FLYBYWIRE_DATADEFINITIONVARIABLE_H
