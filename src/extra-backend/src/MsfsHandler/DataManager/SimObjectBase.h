// Copyright (c) 2022 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

//
// Created by frank on 18.01.2023.
//

#ifndef FLYBYWIRE_A32NX_SIMOBJECTBASE_H
#define FLYBYWIRE_A32NX_SIMOBJECTBASE_H

#include "simple_assert.h"
#include "ManagedDataObjectBase.h"
#include "IDGenerator.h"
#include <sstream>
#include <vector>
#include <SimConnect.h>

class SimObjectBase : public ManagedDataObjectBase {

protected:
  /**
   * Each data definition variable has its own unique id so the sim can map registered data sim
   * objects to data definitions.
   */
  DWORD dataDefId = 0;

  /**
   * SimConnect handle is required for data definitions.
   */
  HANDLE hSimConnect;

  /**
   * Each request for sim object data requires a unique id so the sim can provide the request ID
   * in the response (message SIMCONNECT_RECV_ID_SIMOBJECT_DATA).
   */
  DWORD requestId = 0;

public:

  /**
     * DataDefinition to be used to register a data definition with the sim. <p/>
     * name: the name of the variable <br/>
     * index: the index of the variable <br/>
     * unit: the unit of the variable <br/>
     */
  struct DataDefinition {
    std::string name;
    int index;
    Unit unit;
  };

  SimObjectBase() = delete; // no default constructor
  SimObjectBase(const SimObjectBase&) = delete; // no copy constructor
  SimObjectBase& operator=(const SimObjectBase&) = delete; // no copy assignment

  ~SimObjectBase() override = default;

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
  SimObjectBase(const std::string &varName, bool autoRead, bool autoWrite, FLOAT64 maxAgeTime,
                UINT64 maxAgeTicks, DWORD dataDefId, HANDLE hSimConnect, DWORD requestId)
    : ManagedDataObjectBase(varName, autoRead, autoWrite, maxAgeTime, maxAgeTicks),
      dataDefId(dataDefId), hSimConnect(hSimConnect), requestId(requestId) {}

  /**
   * Sends a data request to the sim to have the sim prepare the requested data.
   * The sim will send the data exactly once via the SIMCONNECT_RECV_ID_SIMOBJECT_DATA message.
   * This calls receiveDataFromSimCallback() to process the data.
   * @return true if the request was successful, false otherwise
   * @See SimConnect_RequestDataOnSimObject
   */
  [[nodiscard]]
  virtual bool requestDataFromSim() const = 0;

  /**
   * Checks the age (time/ticks) of the data and requests an update from the sim if the data is too old.
   * @param timeStamp the current sim time (taken from the sim update event)
   * @param tickCounter the current tick counter (taken from a custom counter at each update event
   * @return false if the request was not successful, true otherwise
   *         (also true when max age is not exceeded - no request will be sent to the sim in this case
   */
  [[nodiscard]]
  virtual bool requestUpdateFromSim(FLOAT64 timeStamp, UINT64 tickCounter) = 0;

  /**
   * Called by the DataManager when a SIMCONNECT_RECV_ID_SIMOBJECT_DATA message for this
   * variables request ID is received.
   * @param pointer to the SIMCONNECT_RECV_SIMOBJECT_DATA structure
   * @See SIMCONNECT_RECV_SIMOBJECT_DATA
   */
  virtual void receiveDataFromSimCallback(const SIMCONNECT_RECV_SIMOBJECT_DATA* pData) = 0;

  /**
   * Writes the data to the sim without updating the time stamps for time and ticks.
   * @return true if the write was successful, false otherwise
   */
  virtual bool writeDataToSim() = 0;

  /**
   * Writes the data to the sim and updates the time stamps for time and ticks.
   * @param timeStamp the current sim time (taken from the sim update event)
   * @param tickCounter the current tick counter (taken from a custom counter at each update event)
   * @return true if the write was successful, false otherwise
   */
  virtual bool updateDataToSim(FLOAT64 timeStamp, UINT64 tickCounter) = 0;

  [[maybe_unused]] [[nodiscard]]
  DWORD getDataDefID() const { return dataDefId; }
  [[nodiscard]]
  DWORD getRequestId() const { return requestId; }
};

#endif //FLYBYWIRE_A32NX_SIMOBJECTBASE_H
